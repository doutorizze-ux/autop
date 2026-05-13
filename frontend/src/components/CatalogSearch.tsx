import { useState } from 'react';
import axios from 'axios';
import { Search, Plus } from 'lucide-react';
import { API_URL } from '../services/api';

const apiBase = API_URL;

type CatalogItem = {
  code: string;
  description: string;
  brand: string;
  category: string;
  family: string;
  applications: string[];
  references: string[];
  score: number;
};

type CatalogSearchProps = {
  onUseCode?: (payload: { query: string; description?: string }) => void;
};

export const CatalogSearch = ({ onUseCode }: CatalogSearchProps) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searched, setSearched] = useState(false);

  const handleSearch = async (event?: React.FormEvent) => {
    if (event) event.preventDefault();

    const value = query.trim();
    if (value.length < 2) return;

    try {
      setIsLoading(true);
      const response = await axios.get(`${apiBase}/api/catalog/vdo/search`, {
        params: { q: value, limit: 40 },
      });
      setResults(response.data.items || []);
      setSearched(true);
    } catch (error) {
      console.error('Catalog Search Error:', error);
      alert('Nao foi possivel consultar o catalogo agora.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="catalog-search-page">
      <div className="catalog-hero">
        <div>
          <h2>Buscar Codigo por Descricao</h2>
          <p>
            Procure por descricao, veiculo, motor, combustivel ou ano e encontre os codigos do
            catalogo para mandar direto para a cotacao.
          </p>
        </div>
      </div>

      <div className="catalog-panel">
        <form onSubmit={handleSearch} className="catalog-search-form">
          <div className="catalog-search-input-wrap">
            <Search size={18} className="catalog-search-icon" />
            <input
              type="text"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Ex: sensor temperatura gol 2022"
              className="catalog-search-input"
            />
          </div>
          <button type="submit" className="catalog-search-button" disabled={isLoading}>
            {isLoading ? 'Buscando...' : 'Buscar no catalogo'}
          </button>
        </form>

        <div className="catalog-search-hint">
          Dica: combine peca + veiculo + ano. Exemplo: <strong>sensor nivel fiesta 2010</strong>
        </div>
      </div>

      <div className="catalog-results-panel">
        <div className="catalog-results-header">
          <h3>Resultados do catalogo</h3>
          {searched && <span>{results.length} codigo(s) encontrado(s)</span>}
        </div>

        {!searched ? (
          <div className="catalog-empty-state">Digite uma descricao para localizar os codigos do catalogo.</div>
        ) : results.length === 0 ? (
          <div className="catalog-empty-state">Nenhum codigo encontrado com essa busca.</div>
        ) : (
          <div className="catalog-results-grid">
            {results.map((item) => (
              <article key={`${item.code}-${item.description}`} className="catalog-result-card">
                <div className="catalog-result-top">
                  <div>
                    <div className="catalog-result-code">{item.code}</div>
                    <div className="catalog-result-description">
                      {item.description || 'Descricao nao informada'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="catalog-use-button"
                    onClick={() =>
                      onUseCode?.({
                        query: item.code,
                        description: item.description,
                      })
                    }
                  >
                    <Plus size={15} /> Usar codigo
                  </button>
                </div>

                <div className="catalog-meta-grid">
                  <div><strong>Categoria:</strong> {item.category || '---'}</div>
                  <div><strong>Familia:</strong> {item.family || '---'}</div>
                  <div><strong>Marca:</strong> {item.brand || '---'}</div>
                </div>

                {item.applications.length > 0 && (
                  <div className="catalog-applications">
                    <strong>Aplicacoes encontradas</strong>
                    <ul>
                      {item.applications.slice(0, 5).map((application, index) => (
                        <li key={`${item.code}-${index}`}>{application}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </article>
            ))}
          </div>
        )}
      </div>

      <style>{`
        .catalog-search-page {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }
        .catalog-hero,
        .catalog-panel,
        .catalog-results-panel {
          background: var(--panel-bg);
          border: 1px solid var(--border-color);
          border-radius: 14px;
          padding: 1.25rem;
        }
        .catalog-hero h2,
        .catalog-results-header h3 {
          color: var(--text-main);
        }
        .catalog-hero p,
        .catalog-search-hint,
        .catalog-results-header span {
          color: var(--text-muted);
          line-height: 1.5;
        }
        .catalog-search-form {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 1rem;
          align-items: center;
        }
        .catalog-search-input-wrap {
          position: relative;
        }
        .catalog-search-icon {
          position: absolute;
          left: 0.9rem;
          top: 50%;
          transform: translateY(-50%);
          color: var(--text-muted);
        }
        .catalog-search-input {
          width: 100%;
          height: 50px;
          border-radius: 10px;
          border: 1px solid var(--border-color);
          background: var(--bg-color);
          color: var(--text-main);
          padding: 0 1rem 0 2.8rem;
          font-size: 0.96rem;
        }
        .catalog-search-button,
        .catalog-use-button {
          border: none;
          border-radius: 10px;
          background: var(--primary-color);
          color: white;
          font-weight: 700;
          cursor: pointer;
        }
        .catalog-search-button {
          height: 50px;
          padding: 0 1.2rem;
        }
        .catalog-use-button {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          padding: 0.65rem 0.9rem;
          white-space: nowrap;
        }
        .catalog-results-header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 1rem;
          margin-bottom: 1rem;
        }
        .catalog-results-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
          gap: 1rem;
        }
        .catalog-result-card {
          border: 1px solid var(--border-color);
          border-radius: 12px;
          padding: 1rem;
          background: var(--bg-color);
          display: flex;
          flex-direction: column;
          gap: 0.85rem;
        }
        .catalog-result-top {
          display: flex;
          justify-content: space-between;
          align-items: flex-start;
          gap: 1rem;
        }
        .catalog-result-code {
          color: var(--primary-color);
          font-weight: 800;
          font-size: 1rem;
          margin-bottom: 0.3rem;
        }
        .catalog-result-description {
          color: var(--text-main);
          font-weight: 600;
          line-height: 1.4;
        }
        .catalog-meta-grid {
          display: grid;
          grid-template-columns: 1fr;
          gap: 0.35rem;
          color: var(--text-muted);
          font-size: 0.84rem;
        }
        .catalog-meta-grid strong,
        .catalog-applications strong {
          color: var(--text-main);
        }
        .catalog-applications {
          color: var(--text-muted);
          font-size: 0.84rem;
        }
        .catalog-applications ul {
          margin: 0.5rem 0 0;
          padding-left: 1rem;
          display: grid;
          gap: 0.35rem;
        }
        .catalog-empty-state {
          color: var(--text-muted);
          padding: 1rem 0.2rem 0.2rem;
        }
        @media (max-width: 900px) {
          .catalog-search-form {
            grid-template-columns: 1fr;
          }
          .catalog-search-button {
            width: 100%;
          }
          .catalog-result-top {
            flex-direction: column;
          }
        }
      `}</style>
    </div>
  );
};
