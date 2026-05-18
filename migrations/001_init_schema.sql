-- BlogAI Database Schema
-- Run this migration on your Railway MySQL database before deploying the application

-- Create blogs table
CREATE TABLE IF NOT EXISTS blogs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    content LONGTEXT NOT NULL,
    quality_score FLOAT,
    technical_depth INT,
    ai_skepticism_level INT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Create prompt_versions table for versioned system prompts
CREATE TABLE IF NOT EXISTS prompt_versions (
    id INT AUTO_INCREMENT PRIMARY KEY,
    version INT NOT NULL,
    content LONGTEXT NOT NULL,
    description VARCHAR(255),
    is_active BOOLEAN DEFAULT FALSE,
    ai_skepticism_level INT DEFAULT 0,
    technical_depth INT DEFAULT 5,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_by VARCHAR(100),
    UNIQUE KEY unique_version (version)
);

-- Insert default prompt version
INSERT INTO prompt_versions (version, content, description, is_active, ai_skepticism_level, technical_depth) 
VALUES (
    1, 
    'You are an expert blog writer specializing in technology and software development.\n\nWhen writing blog posts:\n- Write in a clear, engaging, and professional tone\n- Include practical examples and real-world applications\n- Break down complex concepts into understandable sections\n- Write 3-4 well-developed paragraphs (200-400 words per paragraph)\n- Include a compelling introduction and conclusion\n- Use industry best practices and current trends\n- Make the content valuable for both beginners and experienced developers',
    'Default system prompt v1',
    true,
    0,
    5
) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id);
