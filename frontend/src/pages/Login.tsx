import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import { LogIn } from 'lucide-react';

export const Login = () => {
  const [themeLogo, setThemeLogo] = useState(() => localStorage.getItem('theme_logo') || '');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();
  const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:5000';

  useEffect(() => {
    const loadPublicAppearance = async () => {
      try {
        const response = await axios.get(`${API_URL}/api/config/public`);
        const color = response.data.themeColor || localStorage.getItem('theme_color') || '#0056b3';
        const logo = response.data.themeLogo || '';

        document.documentElement.style.setProperty('--primary-color', color);
        localStorage.setItem('theme_color', color);

        if (logo) {
          localStorage.setItem('theme_logo', logo);
        } else {
          localStorage.removeItem('theme_logo');
        }

        setThemeLogo(logo);
      } catch (err) {
        const savedColor = localStorage.getItem('theme_color');
        if (savedColor) {
          document.documentElement.style.setProperty('--primary-color', savedColor);
        }
      }
    };

    loadPublicAppearance();
  }, [API_URL]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setIsLoading(true);

    try {
      const response = await axios.post(`${API_URL}/api/auth/login`, {
        email,
        password
      });

      login(response.data.token, response.data.user);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err.response?.data?.message || 'Erro ao realizar login. Tente novamente.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="auth-container">
      <div className="auth-card">
        <div className="auth-logo">
          {themeLogo ? (
            <img src={themeLogo} alt="Logo da loja" />
          ) : (
            <h1>Sistema de Atendimento</h1>
          )}
        </div>
        {error && <div className="error-message">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label htmlFor="email">E-mail</label>
            <input
              type="email"
              id="email"
              className="form-input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="Digite seu e-mail"
              required
            />
          </div>
          <div className="form-group">
            <label htmlFor="password">Senha</label>
            <input
              type="password"
              id="password"
              className="form-input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Digite sua senha"
              required
            />
          </div>
          <button type="submit" className="btn-primary" disabled={isLoading} style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
            {isLoading ? 'Entrando...' : (
              <>
                <LogIn size={20} />
                <span>Entrar</span>
              </>
            )}
          </button>
        </form>
      </div>
      <style>{`
        .auth-logo {
          display: flex;
          justify-content: center;
          margin-bottom: 2rem;
        }

        .auth-logo img {
          width: min(180px, 70%);
          max-height: 110px;
          object-fit: contain;
        }

        .auth-logo h1 {
          color: var(--text-main);
          font-size: 1.35rem;
          text-align: center;
        }
      `}</style>
    </div>
  );
};
