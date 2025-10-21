// Check if user is logged in by checking sessionStorage token
export const isLoggedIn = () => {
  const token = sessionStorage.getItem('token');
  return !!token;
};

// Set token after successful login
export const setToken = (token) => {
  sessionStorage.setItem('token', token);
};

// Remove token on logout
export const removeToken = () => {
  sessionStorage.removeItem('token');
};

// Get token
export const getToken = () => {
  return sessionStorage.getItem('token');
}; 