import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import axios from 'axios';
import {jwtDecode} from 'jwt-decode';

interface User {
  id: string;
  name: string;
  email: string;
  role: string;
}

interface AuthContextType {
  user: User | null;
  token: string | null;
  login: (token: string, userData: User) => void;
  logout: () => void;
  isAuthenticated: boolean;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(localStorage.getItem('token'));
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const verifyToken = async () => {
      if (token) {
        try {
          const decoded: any = jwtDecode(token);
          if (decoded.exp * 1000 < Date.now()) {
            logout();
          } else {
            axios.defaults.headers.common['Authorization'] = `Bearer ${token}`;
            const response = await axios.get('http://localhost:5000/api/auth/me');
            setUser(response.data);
          }
        } catch (error) {
          logout();
        }
      }
      setLoading(false);
    };

    verifyToken();
  }, [token]);

  const login = (newToken: string, userData: User) => {
    localStorage.setItem('token', newToken);
    setToken(newToken);
    setUser(userData);
    axios.defaults.headers.common['Authorization'] = `Bearer ${newToken}`;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setToken(null);
    setUser(null);
    delete axios.defaults.headers.common['Authorization'];
  };

  if (loading) return <div style={{ height: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>Carregando...</div>;

  return (
    <AuthContext.Provider value={{ user, token, login, logout, isAuthenticated: !!user }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
