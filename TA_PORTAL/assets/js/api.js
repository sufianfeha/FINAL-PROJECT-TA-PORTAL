// Point this to your PHP routing file
const API_BASE = '../backend/index.php?action=';

export async function fetchApi(action, options = {}) {
    const url = `${API_BASE}${action}`;
    const headers = {};
    
    let body = options.body;
    
    // Automatically stringify JSON if the body isn't a FormData object (like file uploads)
    if (body && !(body instanceof FormData)) {
        body = JSON.stringify(body);
        headers['Content-Type'] = 'application/json';
    }

    const config = {
        method: options.method || 'GET',
        headers: { ...headers, ...options.headers },
        body: body
    };

    try {
        const response = await fetch(url, config);
        
        // Parse the JSON returned by PHP
        const data = await response.json();

        // Check if the backend returned an error or HTTP failure code
        if (!response.ok || !data.ok) {
            // If the user is not logged in (401), redirect them
            if (response.status === 401) {
                window.location.href = '../Login/signin.html';
            }
            throw new Error(data.message || 'An error occurred processing your request.');
        }

        return data;
    } catch (error) {
        console.error(`[API Error] Action: ${action}`, error);
        throw error;
    }
}