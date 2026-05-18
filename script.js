// DOM Elements
const blogsList = document.getElementById('blogsList');
const listView = document.getElementById('listView');
const detailView = document.getElementById('detailView');
const blogDetail = document.getElementById('blogDetail');

// Optional elements (for form if it exists)
const createBlogForm = document.getElementById('createBlogForm');
const topicInput = createBlogForm ? document.getElementById('topicInput') : null;
const submitButton = createBlogForm ? createBlogForm.querySelector('button[type="submit"]') : null;
const submitText = document.getElementById('submitText');
const spinner = document.getElementById('spinner');
const errorMessageList = document.getElementById('errorMessageList');
const successMessageList = document.getElementById('successMessageList');

let currentBlogId = null;

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    loadBlogs();
});

// Form submission (only if form exists)
if (createBlogForm) {
    createBlogForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        const topic = topicInput.value.trim();
        if (!topic) {
            showError('Please enter a topic', 'list');
            return;
        }
        
        hideError('list');
        showLoading(true);
        
        try {
            const res = await fetch('/api/blogs', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({ topic })
            });
            
            if (!res.ok) {
                const errorData = await res.json();
                throw new Error(errorData.error || 'Failed to create blog');
            }
            
            const blog = await res.json();
            
            showSuccess('Blog post created successfully!', 'list');
            topicInput.value = '';
            
            // Reload blogs
            await loadBlogs();
        } catch (error) {
            showError(error.message, 'list');
        } finally {
            showLoading(false);
        }
    });
}

async function loadBlogs() {
    try {
        const res = await fetch('/api/blogs');
        if (!res.ok) {
            throw new Error('Failed to load blogs');
        }
        
        const blogs = await res.json();
        displayBlogsList(blogs);
    } catch (error) {
        showError(error.message, 'list');
    }
}

function displayBlogsList(blogs) {
    if (blogs.length === 0) {
        blogsList.innerHTML = '<div class="empty-state"><p>No blog posts yet. Create one to get started!</p></div>';
        return;
    }
    
    blogsList.innerHTML = blogs.map(blog => `
        <div class="blog-item" onclick="viewBlog(${blog.id})">
            <h6>${escapeHtml(blog.title)}</h6>
            <span class="date">${formatDate(blog.created_at)}</span>
        </div>
    `).join('');
}

async function viewBlog(id) {
    try {
        const res = await fetch(`/api/blogs/${id}`);
        if (!res.ok) {
            throw new Error('Failed to load blog');
        }
        
        const blog = await res.json();
        currentBlogId = blog.id;
        
        blogDetail.innerHTML = `
            <div class="blog-title">${escapeHtml(blog.title)}</div>
            <div class="blog-date">${formatDate(blog.created_at)}</div>
            <div class="blog-content">${escapeHtml(blog.content)}</div>
        `;
        
        showDetailView();
    } catch (error) {
        showError(error.message, 'list');
    }
}

async function deleteBlog() {
    if (!currentBlogId) return;
    
    if (!confirm('Are you sure you want to delete this blog post?')) {
        return;
    }
    
    try {
        const res = await fetch(`/api/blogs/${currentBlogId}`, {
            method: 'DELETE'
        });
        
        if (!res.ok) {
            throw new Error('Failed to delete blog');
        }
        
        showSuccess('Blog post deleted successfully!', 'list');
        currentBlogId = null;
        showListView();
        await loadBlogs();
    } catch (error) {
        showError(error.message, 'detail');
    }
}

function showListView() {
    listView.classList.add('active');
    detailView.classList.remove('active');
}

function showDetailView() {
    listView.classList.remove('active');
    detailView.classList.add('active');
}

function showError(message, view) {
    const errorElement = view === 'list' ? errorMessageList : document.getElementById('errorMessageDetail') || errorMessageList;
    if (errorElement) {
        errorElement.textContent = message;
        errorElement.classList.add('show');
    } else {
        console.error('Error:', message);
    }
}

function hideError(view) {
    const errorElement = view === 'list' ? errorMessageList : document.getElementById('errorMessageDetail') || errorMessageList;
    if (errorElement) {
        errorElement.textContent = '';
        errorElement.classList.remove('show');
    }
}

function showSuccess(message, view) {
    const successElement = view === 'list' ? successMessageList : document.getElementById('successMessageDetail') || successMessageList;
    if (successElement) {
        successElement.textContent = message;
        successElement.classList.add('show');
        
        // Hide after 3 seconds
        setTimeout(() => {
            successElement.classList.remove('show');
        }, 3000);
    } else {
        console.log('Success:', message);
    }
}

function showLoading(isLoading) {
    if (!submitButton) return; // No form, skip
    
    submitButton.disabled = isLoading;
    if (isLoading) {
        submitText.style.display = 'none';
        spinner.classList.add('show');
    } else {
        submitText.style.display = 'inline';
        spinner.classList.remove('show');
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}
