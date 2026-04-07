export const getInitialAuthState = (): boolean => {
    return !!localStorage.getItem('auth_token');
};

export const setAuthToken = (token: string | null) => {
    if (token) {
        localStorage.setItem('auth_token', token);
    } else {
        localStorage.removeItem('auth_token');
    }
};
