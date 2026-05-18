const express = require('express');
const cors = require('cors');
const path = require('path');
const mysql = require('mysql2/promise');
const schedule = require('node-schedule');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static(__dirname));

// LLM Configuration
const LLM_CONFIG = {
    provider: process.env.LLM_PROVIDER,
    apiKey: process.env.LLM_API_KEY,
    endpoint: process.env.LLM_ENDPOINT,
    model: process.env.LLM_MODEL || 'claude-haiku-4-5'
};

// Database Configuration
let DB_CONFIG = {};

// Parse Railway DATABASE_URL if available, otherwise use individual env vars
if (process.env.DATABASE_URL) {
    // Parse Railway's DATABASE_URL format: mysql://user:password@host:port/database
    try {
        const url = new URL(process.env.DATABASE_URL);
        DB_CONFIG = {
            host: url.hostname,
            user: url.username,
            password: url.password,
            database: url.pathname.slice(1),
            port: url.port || 3306
        };
    } catch (e) {
        console.error('Error parsing DATABASE_URL:', e.message);
        process.exit(1);
    }
} else {
    // Fallback to individual environment variables
    DB_CONFIG = {
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'blogai',
        port: process.env.DB_PORT || 3306
    };
}

let pool;

// Initialize database connection pool
async function initializeDatabase() {
    try {
        // Create pool
        pool = mysql.createPool(DB_CONFIG);
        
        // Test connection
        const connection = await pool.getConnection();
        console.log('Database connected successfully');
        
        // Verify tables exist
        const [blogsTable] = await connection.execute(
            'SELECT 1 FROM information_schema.tables WHERE table_name = ? AND table_schema = DATABASE()',
            ['blogs']
        );
        
        const [promptsTable] = await connection.execute(
            'SELECT 1 FROM information_schema.tables WHERE table_name = ? AND table_schema = DATABASE()',
            ['prompt_versions']
        );
        
        if (blogsTable.length === 0) {
            console.error('ERROR: blogs table does not exist. Please create it before running the application.');
            connection.release();
            process.exit(1);
        }
        
        if (promptsTable.length === 0) {
            console.error('ERROR: prompt_versions table does not exist. Please create it before running the application.');
            connection.release();
            process.exit(1);
        }
        
        connection.release();
        console.log('Database tables verified successfully');
    } catch (error) {
        console.error('Database initialization error:', error);
        process.exit(1);
    }
}

// Validate LLM configuration
if (!LLM_CONFIG.apiKey) {
    console.error('ERROR: LLM_API_KEY environment variable is not set.');
    process.exit(1);
}

if (!LLM_CONFIG.endpoint) {
    console.error('ERROR: LLM_ENDPOINT environment variable is not set.');
    process.exit(1);
}

console.log('LLM Configuration loaded successfully');
console.log(`Provider: ${LLM_CONFIG.provider}`);
console.log(`Model: ${LLM_CONFIG.model}`);

// Sample topics for automated blog generation
const SAMPLE_TOPICS = [
    'The Future of Artificial Intelligence',
    'Machine Learning Best Practices',
    'Web Development Trends This Year',
    'Cloud Computing Security',
    'Building Scalable Applications',
    'DevOps and Continuous Integration',
    'Data Privacy and GDPR',
    'Microservices Architecture',
    'GraphQL vs REST API',
    'Docker and Container Orchestration',
    'Blockchain Technology Applications',
    'Cybersecurity Best Practices',
    'Performance Optimization Techniques',
    'Agile Software Development',
    'API Design Principles'
];

let autoGenerationEnabled = process.env.AUTO_GENERATE_BLOGS === 'true';
let autoGenerationSchedule = null;

// Helper function to get the current active system prompt
async function getActivePrompt() {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute(
            'SELECT content FROM prompt_versions WHERE is_active = true ORDER BY version DESC LIMIT 1'
        );
        connection.release();
        
        if (rows.length > 0) {
            return rows[0].content;
        }
        
        // Fallback to default if no active prompt
        return `You are an expert blog writer specializing in technology and software development.`;
    } catch (error) {
        console.error('Error fetching prompt:', error);
        return `You are an expert blog writer specializing in technology and software development.`;
    }
}

// Helper function to get current prompt metadata
async function getActivePromptMetadata() {
    try {
        const connection = await pool.getConnection();
        const [rows] = await connection.execute(
            'SELECT version, ai_skepticism_level, technical_depth FROM prompt_versions WHERE is_active = true ORDER BY version DESC LIMIT 1'
        );
        connection.release();
        
        if (rows.length > 0) {
            return rows[0];
        }
        
        return { version: 1, ai_skepticism_level: 0, technical_depth: 5 };
    } catch (error) {
        console.error('Error fetching prompt metadata:', error);
        return { version: 1, ai_skepticism_level: 0, technical_depth: 5 };
    }
}

// Helper function to score blog quality
function scoreBlogQuality(title, content) {
    let score = 50; // Base score
    
    // Word count scoring (ideal: 800-1500 words)
    const wordCount = content.split(/\s+/).length;
    if (wordCount >= 800 && wordCount <= 1500) {
        score += 20;
    } else if (wordCount >= 600 && wordCount <= 2000) {
        score += 10;
    }
    
    // Technical depth scoring
    const technicalTerms = [
        'algorithm', 'architecture', 'framework', 'library', 'API', 'database', 
        'optimization', 'performance', 'scalability', 'implementation', 'deployment',
        'authentication', 'encryption', 'middleware', 'cache', 'async', 'concurrent',
        'thread', 'process', 'memory', 'latency', 'throughput'
    ];
    const technicalCount = technicalTerms.filter(term => 
        content.toLowerCase().includes(term)
    ).length;
    score += Math.min(technicalCount * 2, 15);
    
    // Sentence structure diversity
    const sentences = content.split(/[.!?]+/).filter(s => s.trim().length > 0);
    const avgSentenceLength = content.split(/\s+/).length / sentences.length;
    if (avgSentenceLength >= 15 && avgSentenceLength <= 25) {
        score += 10;
    }
    
    // Title quality
    if (title.length >= 15 && title.length <= 100) {
        score += 5;
    }
    
    return Math.min(100, Math.max(0, score));
}

// Helper function to generate evolved prompt using LLM
async function generateEvolvedPrompt(currentPrompt, qualityScore, previousVersion) {
    const evolvePrompt = `You are a meta-prompt engineer. Your task is to improve a blog writing prompt based on performance.

Current prompt:
"""
${currentPrompt}
"""

Performance metrics from last blog:
- Quality Score: ${qualityScore.toFixed(2)}/100
- Prompt Version: ${previousVersion}

Your task:
1. Analyze the current prompt
2. Evolve it to be MORE skeptical of AI (add critical perspective, acknowledge limitations, question claims)
3. Make it MORE technical (increase jargon, expect technical audience, go deeper into implementation details)
4. Maintain the core writing quality
5. Keep it practical and actionable for writing blog posts

Generate an improved prompt that naturally evolves from the current one. The evolution should be organic - don't artificially insert cynicism, but rather deepen the critical analysis and technical rigor.

IMPORTANT: Return ONLY the new prompt text, nothing else. No explanations, no preamble, just the improved prompt.`;

    const requestBody = {
        model: LLM_CONFIG.model,
        max_tokens: 1000,
        messages: [
            {
                role: 'user',
                content: evolvePrompt
            }
        ]
    };

    const headers = {
        'Content-Type': 'application/json',
        'api-key': LLM_CONFIG.apiKey,
        'Ocp-Apim-Subscription-Key': LLM_CONFIG.apiKey,
        'anthropic-version': '2023-06-01'
    };

    const url = new URL(LLM_CONFIG.endpoint);
    url.searchParams.append('subscription-key', LLM_CONFIG.apiKey);

    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, response.statusText, errorText);
        throw new Error(`LLM API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    let responseText;
    
    if (LLM_CONFIG.provider === 'openai' || LLM_CONFIG.provider === 'chatgpt') {
        responseText = data.choices[0].message.content;
    } else if (LLM_CONFIG.provider === 'anthropic') {
        responseText = data.content[0].text;
    } else {
        throw new Error(`Unsupported provider: ${LLM_CONFIG.provider}`);
    }

    return responseText.trim();
}

// Helper function to automatically improve prompt after blog generation
async function improvePromptAfterBlog(blogId, title, content) {
    try {
        const qualityScore = scoreBlogQuality(title, content);
        const metadata = await getActivePromptMetadata();
        
        // Update blog with metrics
        const connection = await pool.getConnection();
        await connection.execute(
            'UPDATE blogs SET quality_score = ?, technical_depth = ?, ai_skepticism_level = ? WHERE id = ?',
            [qualityScore, metadata.technical_depth, metadata.ai_skepticism_level, blogId]
        );
        
        console.log(`📊 Blog #${blogId} Quality Score: ${qualityScore.toFixed(2)}/100`);
        
        // Get the current active prompt content
        const [currentPromptRows] = await connection.execute(
            'SELECT content FROM prompt_versions WHERE is_active = true ORDER BY version DESC LIMIT 1'
        );
        const currentPromptContent = currentPromptRows.length > 0 ? currentPromptRows[0].content : '';
        
        // Generate evolved prompt using LLM
        console.log(`🧬 Asking LLM to evolve prompt for better quality...`);
        const evolvedPromptContent = await generateEvolvedPrompt(currentPromptContent, qualityScore, metadata.version);
        
        // Get next version number
        const [versionResult] = await connection.execute(
            'SELECT MAX(version) as maxVersion FROM prompt_versions'
        );
        const nextVersion = (versionResult[0].maxVersion || 0) + 1;
        
        // Increment skepticism and technical depth slightly (for tracking)
        const newSkepticism = Math.min(metadata.ai_skepticism_level + 1, 20);
        const newTechnicalDepth = Math.min(metadata.technical_depth + 1, 20);
        
        // Create new prompt version with LLM-evolved content
        await connection.execute(
            `INSERT INTO prompt_versions (version, content, description, is_active, ai_skepticism_level, technical_depth, updated_by) 
             VALUES (?, ?, ?, ?, ?, ?, ?)`,
            [
                nextVersion,
                evolvedPromptContent,
                `Auto-evolved v${nextVersion} - Quality: ${qualityScore.toFixed(2)}, Evolved by LLM`,
                true,
                newSkepticism,
                newTechnicalDepth,
                'agent-self-evolution'
            ]
        );
        
        // Deactivate old prompt
        await connection.execute(
            'UPDATE prompt_versions SET is_active = false WHERE version = ?',
            [metadata.version]
        );
        
        connection.release();
        
        console.log(`✨ Prompt evolved to v${nextVersion} (Quality: ${qualityScore.toFixed(2)}/100) - LLM generated new instructions organically`);
        
        return evolvedPromptContent;
    } catch (error) {
        console.error('Error improving prompt:', error);
    }
}

// Helper function to call LLM
async function generateBlogContent(topic) {
    const systemPrompt = await getActivePrompt();
    
    const prompt = `${systemPrompt}

Topic: "${topic}"

Write a blog post about this topic and return ONLY the following JSON format (no other text):
{
    "title": "Blog Post Title",
    "content": "Full blog post content here. Write 3-4 well-developed paragraphs."
}

Ensure the JSON is valid and properly formatted.`;

    const requestBody = {
        model: LLM_CONFIG.model,
        max_tokens: 2000,
        messages: [
            {
                role: 'user',
                content: prompt
            }
        ]
    };

    const headers = {
        'Content-Type': 'application/json',
        'api-key': LLM_CONFIG.apiKey,
        'Ocp-Apim-Subscription-Key': LLM_CONFIG.apiKey,
        'anthropic-version': '2023-06-01'
    };

    const url = new URL(LLM_CONFIG.endpoint);
    url.searchParams.append('subscription-key', LLM_CONFIG.apiKey);

    const response = await fetch(url.toString(), {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
        const errorText = await response.text();
        console.error('API Error:', response.status, response.statusText, errorText);
        throw new Error(`LLM API request failed: ${response.statusText}`);
    }

    const data = await response.json();
    let responseText;
    
    if (LLM_CONFIG.provider === 'openai' || LLM_CONFIG.provider === 'chatgpt') {
        responseText = data.choices[0].message.content;
    } else if (LLM_CONFIG.provider === 'anthropic') {
        responseText = data.content[0].text;
    } else {
        throw new Error(`Unsupported provider: ${LLM_CONFIG.provider}`);
    }

    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
        throw new Error('Could not parse JSON from LLM response');
    }

    const blogData = JSON.parse(jsonMatch[0]);
    return blogData;
}

// Function to automatically generate blog posts
async function autoGenerateBlog() {
    try {
        const topic = SAMPLE_TOPICS[Math.floor(Math.random() * SAMPLE_TOPICS.length)];
        console.log(`🤖 Auto-generating blog about: "${topic}"`);
        
        const blogData = await generateBlogContent(topic);
        
        const connection = await pool.getConnection();
        const [result] = await connection.execute(
            'INSERT INTO blogs (title, content) VALUES (?, ?)',
            [blogData.title, blogData.content]
        );
        connection.release();
        
        const blogId = result.insertId;
        console.log(`✅ Auto-generated blog #${blogId}: "${blogData.title}"`);
        
        // Automatically improve prompt after blog generation
        await improvePromptAfterBlog(blogId, blogData.title, blogData.content);
    } catch (error) {
        console.error('❌ Error auto-generating blog:', error.message);
    }
}

// Function to start auto-generation scheduler
function startAutoGeneration() {
    if (autoGenerationSchedule) {
        console.log('Auto-generation already running');
        return;
    }
    
    // Schedule: every 5 minutes (*/5 * * * *)
    autoGenerationSchedule = schedule.scheduleJob('*/1 * * * *', autoGenerateBlog);
    console.log('🚀 Auto-generation scheduler started (every 1 minute)');
}

// Function to stop auto-generation scheduler
function stopAutoGeneration() {
    if (autoGenerationSchedule) {
        autoGenerationSchedule.cancel();
        autoGenerationSchedule = null;
        console.log('⛔ Auto-generation scheduler stopped');
    }
}

// API Endpoints

// Get all blogs
app.get('/api/blogs', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [blogs] = await connection.execute(
            'SELECT id, title, created_at FROM blogs ORDER BY created_at DESC'
        );
        connection.release();
        res.json(blogs);
    } catch (error) {
        console.error('Error fetching blogs:', error);
        res.status(500).json({ error: 'Failed to fetch blogs' });
    }
});

// Get single blog
app.get('/api/blogs/:id', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [blogs] = await connection.execute(
            'SELECT * FROM blogs WHERE id = ?',
            [req.params.id]
        );
        connection.release();
        
        if (blogs.length === 0) {
            return res.status(404).json({ error: 'Blog not found' });
        }
        
        res.json(blogs[0]);
    } catch (error) {
        console.error('Error fetching blog:', error);
        res.status(500).json({ error: 'Failed to fetch blog' });
    }
});

// Create new blog (generate with LLM)
app.post('/api/blogs', async (req, res) => {
    try {
        const { topic } = req.body;

        if (!topic || topic.trim() === '') {
            return res.status(400).json({ error: 'Topic is required' });
        }

        // Generate blog content using LLM
        const blogData = await generateBlogContent(topic);

        // Save to database
        const connection = await pool.getConnection();
        const [result] = await connection.execute(
            'INSERT INTO blogs (title, content) VALUES (?, ?)',
            [blogData.title, blogData.content]
        );
        connection.release();

        const blogId = result.insertId;
        
        // Automatically improve prompt after blog generation
        await improvePromptAfterBlog(blogId, blogData.title, blogData.content);

        res.status(201).json({
            id: blogId,
            title: blogData.title,
            content: blogData.content,
            created_at: new Date()
        });
    } catch (error) {
        console.error('Error creating blog:', error);
        res.status(500).json({ error: error.message || 'Failed to create blog' });
    }
});

// Delete blog
app.delete('/api/blogs/:id', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [result] = await connection.execute(
            'DELETE FROM blogs WHERE id = ?',
            [req.params.id]
        );
        connection.release();

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Blog not found' });
        }

        res.json({ message: 'Blog deleted successfully' });
    } catch (error) {
        console.error('Error deleting blog:', error);
        res.status(500).json({ error: 'Failed to delete blog' });
    }
});

// Auto-generation control endpoints
app.post('/api/auto-generate/start', (req, res) => {
    startAutoGeneration();
    autoGenerationEnabled = true;
    res.json({ message: 'Auto-generation started', enabled: true });
});

app.post('/api/auto-generate/stop', (req, res) => {
    stopAutoGeneration();
    autoGenerationEnabled = false;
    res.json({ message: 'Auto-generation stopped', enabled: false });
});

app.get('/api/auto-generate/status', (req, res) => {
    res.json({ 
        enabled: autoGenerationEnabled, 
        running: autoGenerationSchedule !== null,
        nextTopics: SAMPLE_TOPICS.slice(0, 5)
    });
});

// Manual trigger for auto-generation
app.post('/api/auto-generate/generate-now', async (req, res) => {
    try {
        await autoGenerateBlog();
        res.json({ message: 'Blog generated successfully' });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// ========== PROMPT MANAGEMENT ENDPOINTS ==========

// Get all prompt versions
app.get('/api/prompts', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [prompts] = await connection.execute(
            'SELECT id, version, description, is_active, created_at, updated_by FROM prompt_versions ORDER BY version DESC'
        );
        connection.release();
        res.json(prompts);
    } catch (error) {
        console.error('Error fetching prompts:', error);
        res.status(500).json({ error: 'Failed to fetch prompts' });
    }
});

// Get current active prompt
app.get('/api/prompts/active', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [prompts] = await connection.execute(
            'SELECT id, version, content, description, created_at, updated_by FROM prompt_versions WHERE is_active = true ORDER BY version DESC LIMIT 1'
        );
        connection.release();
        
        if (prompts.length === 0) {
            return res.status(404).json({ error: 'No active prompt found' });
        }
        
        res.json(prompts[0]);
    } catch (error) {
        console.error('Error fetching active prompt:', error);
        res.status(500).json({ error: 'Failed to fetch active prompt' });
    }
});

// Get specific prompt version
app.get('/api/prompts/:version', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [prompts] = await connection.execute(
            'SELECT id, version, content, description, is_active, created_at, updated_by FROM prompt_versions WHERE version = ?',
            [req.params.version]
        );
        connection.release();
        
        if (prompts.length === 0) {
            return res.status(404).json({ error: 'Prompt version not found' });
        }
        
        res.json(prompts[0]);
    } catch (error) {
        console.error('Error fetching prompt:', error);
        res.status(500).json({ error: 'Failed to fetch prompt' });
    }
});

// Create new prompt version
app.post('/api/prompts', async (req, res) => {
    try {
        const { content, description, updatedBy, activate, ai_skepticism_level, technical_depth } = req.body;

        if (!content || content.trim() === '') {
            return res.status(400).json({ error: 'Prompt content is required' });
        }

        const connection = await pool.getConnection();
        
        // Get next version number
        const [versionResult] = await connection.execute(
            'SELECT MAX(version) as maxVersion FROM prompt_versions'
        );
        const nextVersion = (versionResult[0].maxVersion || 0) + 1;

        // Deactivate current active prompt if activating new one
        if (activate) {
            await connection.execute('UPDATE prompt_versions SET is_active = false WHERE is_active = true');
        }

        // Insert new prompt version with optional metrics
        const [result] = await connection.execute(
            'INSERT INTO prompt_versions (version, content, description, is_active, updated_by, ai_skepticism_level, technical_depth) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
                nextVersion, 
                content, 
                description || `Version ${nextVersion}`, 
                activate || false, 
                updatedBy || 'system',
                ai_skepticism_level || 0,
                technical_depth || 5
            ]
        );

        connection.release();

        res.status(201).json({
            id: result.insertId,
            version: nextVersion,
            content: content,
            description: description,
            is_active: activate || false,
            created_at: new Date(),
            updated_by: updatedBy || 'system',
            ai_skepticism_level: ai_skepticism_level || 0,
            technical_depth: technical_depth || 5
        });
    } catch (error) {
        console.error('Error creating prompt:', error);
        res.status(500).json({ error: error.message || 'Failed to create prompt' });
    }
});

// Update/activate a prompt version
app.patch('/api/prompts/:version/activate', async (req, res) => {
    try {
        const connection = await pool.getConnection();

        // Check if version exists
        const [prompts] = await connection.execute(
            'SELECT id FROM prompt_versions WHERE version = ?',
            [req.params.version]
        );

        if (prompts.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Prompt version not found' });
        }

        // Deactivate all other prompts and activate this one
        await connection.execute('UPDATE prompt_versions SET is_active = false WHERE is_active = true');
        await connection.execute(
            'UPDATE prompt_versions SET is_active = true WHERE version = ?',
            [req.params.version]
        );

        connection.release();

        res.json({ 
            message: `Prompt version ${req.params.version} is now active`,
            version: req.params.version,
            is_active: true
        });
    } catch (error) {
        console.error('Error activating prompt:', error);
        res.status(500).json({ error: 'Failed to activate prompt' });
    }
});

// Delete a prompt version
app.delete('/api/prompts/:version', async (req, res) => {
    try {
        const connection = await pool.getConnection();

        // Don't delete the active prompt
        const [prompts] = await connection.execute(
            'SELECT is_active FROM prompt_versions WHERE version = ?',
            [req.params.version]
        );

        if (prompts.length === 0) {
            connection.release();
            return res.status(404).json({ error: 'Prompt version not found' });
        }

        if (prompts[0].is_active) {
            connection.release();
            return res.status(400).json({ error: 'Cannot delete the active prompt version' });
        }

        // Delete the prompt
        const [result] = await connection.execute(
            'DELETE FROM prompt_versions WHERE version = ?',
            [req.params.version]
        );

        connection.release();

        if (result.affectedRows === 0) {
            return res.status(404).json({ error: 'Prompt version not found' });
        }

        res.json({ message: `Prompt version ${req.params.version} deleted successfully` });
    } catch (error) {
        console.error('Error deleting prompt:', error);
        res.status(500).json({ error: 'Failed to delete prompt' });
    }
});

// ========== ANALYTICS ENDPOINTS ==========

// Get prompt evolution history with metrics
app.get('/api/analytics/prompt-evolution', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [evolution] = await connection.execute(`
            SELECT 
                id, version, description, is_active, ai_skepticism_level, technical_depth, 
                created_at, updated_by,
                (SELECT COUNT(*) FROM blogs WHERE ai_skepticism_level = prompt_versions.ai_skepticism_level) as blogs_count,
                (SELECT AVG(quality_score) FROM blogs WHERE ai_skepticism_level = prompt_versions.ai_skepticism_level) as avg_quality
            FROM prompt_versions 
            ORDER BY version DESC
        `);
        connection.release();
        
        res.json(evolution);
    } catch (error) {
        console.error('Error fetching prompt evolution:', error);
        res.status(500).json({ error: 'Failed to fetch evolution history' });
    }
});

// Get blog quality metrics
app.get('/api/analytics/blog-metrics', async (req, res) => {
    try {
        const connection = await pool.getConnection();
        const [metrics] = await connection.execute(`
            SELECT 
                COUNT(*) as total_blogs,
                AVG(quality_score) as avg_quality_score,
                MAX(quality_score) as best_quality_score,
                MIN(quality_score) as worst_quality_score,
                AVG(technical_depth) as avg_technical_depth,
                AVG(ai_skepticism_level) as avg_skepticism_level
            FROM blogs
        `);
        
        const [bySkepticism] = await connection.execute(`
            SELECT 
                ai_skepticism_level,
                COUNT(*) as blog_count,
                AVG(quality_score) as avg_quality
            FROM blogs
            WHERE ai_skepticism_level IS NOT NULL
            GROUP BY ai_skepticism_level
            ORDER BY ai_skepticism_level DESC
        `);
        
        connection.release();
        
        res.json({
            overall: metrics[0],
            by_skepticism_level: bySkepticism
        });
    } catch (error) {
        console.error('Error fetching metrics:', error);
        res.status(500).json({ error: 'Failed to fetch metrics' });
    }
});

// Serve index.html
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

// Start server
async function startServer() {
    await initializeDatabase();
    
    app.listen(PORT, () => {
        console.log(`Server running at http://localhost:${PORT}`);
        
        // Start auto-generation if enabled
        if (autoGenerationEnabled) {
            startAutoGeneration();
        } else {
            console.log('ℹ️  Auto-generation is disabled. Use POST /api/auto-generate/start to enable');
        }
    });
}

startServer();
