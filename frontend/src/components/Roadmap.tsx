import {
    BadgeCheck,
    CalendarClock,
    CloudCog,
    Layers3,
    Rocket,
    ShieldCheck,
    Workflow,
} from 'lucide-react';

const currentVersion = 'v1.0.0';

const deliveredItems = [
    'Painel operacional centralizado para atendimento, cotações e fornecedores.',
    'Módulo de clientes com CRM básico e abertura rápida do atendimento.',
    'Conexão com WhatsApp e operação de conversas em tempo real.',
    'Histórico de orçamentos com reabertura e exportação em PDF/Excel.',
    'Gestão de fornecedores, logins e preferências do sistema.',
];

const nextUpdates = [
    'Integração com os fornecedores DPK e Kaizen.',
    'Liberação e homologação do IP do servidor em ambientes com proteção Cloudflare.',
    'Ajustes de estabilidade nas rotinas de cotação simultânea.',
    'Melhorias na experiência visual do painel e nos fluxos de operação diária.',
    'Mais segurança e rastreabilidade em sessões, acessos e ações internas.',
];

const roadmapItems = [
    {
        title: 'Expansão de Fornecedores',
        icon: Layers3,
        items: [
            'Novas integrações com distribuidores estratégicos.',
            'Padronização do fluxo de login, busca e retorno de preços.',
            'Melhor cobertura para confronto entre fornecedores.',
        ],
    },
    {
        title: 'Infraestrutura e Acesso',
        icon: CloudCog,
        items: [
            'Compatibilidade maior com bloqueios por IP, firewall e Cloudflare.',
            'Ambiente mais preparado para operação contínua no servidor.',
            'Aprimoramento do monitoramento técnico das integrações.',
        ],
    },
    {
        title: 'Automação Operacional',
        icon: Workflow,
        items: [
            'Processos mais automáticos nas cotações e no apoio ao atendimento.',
            'Redução de tarefas manuais repetitivas para a equipe.',
            'Base pronta para evoluções com inteligência operacional.',
        ],
    },
    {
        title: 'Segurança e Governança',
        icon: ShieldCheck,
        items: [
            'Melhor controle de permissões por perfil.',
            'Logs mais claros para auditoria, suporte e investigação.',
            'Fortalecimento das rotinas de autenticação e estabilidade.',
        ],
    },
];

export const Roadmap = () => {
    return (
        <div className="roadmap-container">
            <section className="roadmap-hero">
                <div>
                    <span className="roadmap-kicker">Planejamento do produto</span>
                    <h1 className="page-title">Versão e Roadmap</h1>
                    <p className="roadmap-intro">
                        Esta área apresenta a versão atual do sistema e a direção das próximas evoluções planejadas
                        para a operação, integrações e crescimento da plataforma.
                    </p>
                </div>
                <div className="version-card">
                    <span className="version-label">Versão atual</span>
                    <strong>{currentVersion}</strong>
                    <small>Primeira versão estável em operação</small>
                </div>
            </section>

            <section className="roadmap-grid">
                <article className="roadmap-panel">
                    <div className="panel-heading">
                        <BadgeCheck size={18} />
                        <h2>Base já implementada</h2>
                    </div>
                    <div className="roadmap-list">
                        {deliveredItems.map((item) => (
                            <div key={item} className="roadmap-list-item">
                                <span className="roadmap-bullet" />
                                <p>{item}</p>
                            </div>
                        ))}
                    </div>
                </article>

                <article className="roadmap-panel roadmap-panel-highlight">
                    <div className="panel-heading">
                        <Rocket size={18} />
                        <h2>Próximas atualizações</h2>
                    </div>
                    <div className="roadmap-list">
                        {nextUpdates.map((item) => (
                            <div key={item} className="roadmap-list-item">
                                <span className="roadmap-bullet" />
                                <p>{item}</p>
                            </div>
                        ))}
                    </div>
                </article>
            </section>

            <section className="timeline-panel">
                <div className="panel-heading">
                    <CalendarClock size={18} />
                    <h2>Roadmap de evolução</h2>
                </div>
                <p className="timeline-copy">
                    O sistema seguirá evoluindo em ciclos contínuos, com prioridade para novas integrações,
                    estabilidade operacional, segurança e ganho de velocidade para a equipe.
                </p>

                <div className="timeline-grid">
                    {roadmapItems.map(({ title, icon: Icon, items }) => (
                        <article key={title} className="timeline-card">
                            <div className="timeline-card-header">
                                <span className="timeline-icon">
                                    <Icon size={18} />
                                </span>
                                <h3>{title}</h3>
                            </div>
                            <div className="timeline-list">
                                {items.map((item) => (
                                    <div key={item} className="timeline-list-item">
                                        <span className="timeline-dot" />
                                        <p>{item}</p>
                                    </div>
                                ))}
                            </div>
                        </article>
                    ))}
                </div>
            </section>

            <style>{`
                .roadmap-container {
                    display: flex;
                    flex-direction: column;
                    gap: 1.5rem;
                }
                .roadmap-hero,
                .roadmap-panel,
                .timeline-panel {
                    background: var(--panel-bg);
                    border: 1px solid var(--border-color);
                    border-radius: 16px;
                }
                .roadmap-hero {
                    padding: 1.75rem;
                    display: flex;
                    justify-content: space-between;
                    align-items: flex-start;
                    gap: 1.5rem;
                    background:
                        linear-gradient(135deg, rgba(15, 23, 42, 0.03), rgba(37, 99, 235, 0.08)),
                        var(--panel-bg);
                }
                .roadmap-kicker {
                    display: inline-block;
                    text-transform: uppercase;
                    letter-spacing: 0.14em;
                    font-size: 0.72rem;
                    color: var(--text-muted);
                    margin-bottom: 0.6rem;
                }
                .roadmap-intro {
                    margin-top: 0.65rem;
                    max-width: 820px;
                    color: var(--text-muted);
                    line-height: 1.7;
                }
                .version-card {
                    min-width: 220px;
                    padding: 1rem 1.1rem;
                    border-radius: 14px;
                    background: rgba(15, 23, 42, 0.04);
                    border: 1px solid rgba(15, 23, 42, 0.08);
                    display: flex;
                    flex-direction: column;
                    gap: 0.35rem;
                }
                .version-label {
                    font-size: 0.78rem;
                    text-transform: uppercase;
                    letter-spacing: 0.12em;
                    color: var(--text-muted);
                }
                .version-card strong {
                    font-size: 2rem;
                    color: var(--text-main);
                    line-height: 1;
                }
                .version-card small {
                    color: var(--text-muted);
                }
                .roadmap-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 1.5rem;
                }
                .roadmap-panel,
                .timeline-panel {
                    padding: 1.5rem;
                }
                .roadmap-panel-highlight {
                    background:
                        linear-gradient(180deg, rgba(37, 99, 235, 0.05), rgba(37, 99, 235, 0.02)),
                        var(--panel-bg);
                }
                .panel-heading {
                    display: flex;
                    align-items: center;
                    gap: 0.65rem;
                    margin-bottom: 1rem;
                }
                .panel-heading h2 {
                    margin: 0;
                    font-size: 1.08rem;
                    color: var(--text-main);
                }
                .roadmap-list,
                .timeline-list {
                    display: flex;
                    flex-direction: column;
                    gap: 0.8rem;
                }
                .roadmap-list-item,
                .timeline-list-item {
                    display: flex;
                    align-items: flex-start;
                    gap: 0.75rem;
                }
                .roadmap-list-item p,
                .timeline-list-item p,
                .timeline-copy {
                    margin: 0;
                    color: var(--text-muted);
                    line-height: 1.65;
                }
                .roadmap-bullet,
                .timeline-dot {
                    width: 9px;
                    height: 9px;
                    border-radius: 999px;
                    margin-top: 0.55rem;
                    flex-shrink: 0;
                    background: var(--primary-color);
                }
                .timeline-copy {
                    margin-bottom: 1.25rem;
                    max-width: 860px;
                }
                .timeline-grid {
                    display: grid;
                    grid-template-columns: repeat(2, minmax(0, 1fr));
                    gap: 1rem;
                }
                .timeline-card {
                    border: 1px solid var(--border-color);
                    border-radius: 14px;
                    padding: 1rem;
                    background: var(--bg-color);
                }
                .timeline-card-header {
                    display: flex;
                    align-items: center;
                    gap: 0.75rem;
                    margin-bottom: 0.9rem;
                }
                .timeline-card-header h3 {
                    margin: 0;
                    color: var(--text-main);
                    font-size: 1rem;
                }
                .timeline-icon {
                    width: 36px;
                    height: 36px;
                    display: inline-flex;
                    align-items: center;
                    justify-content: center;
                    border-radius: 12px;
                    background: rgba(37, 99, 235, 0.1);
                    color: var(--primary-color);
                }
                @media (max-width: 980px) {
                    .roadmap-hero,
                    .roadmap-grid,
                    .timeline-grid {
                        grid-template-columns: 1fr;
                    }
                    .roadmap-hero {
                        flex-direction: column;
                    }
                    .version-card {
                        min-width: 0;
                        width: 100%;
                    }
                }
            `}</style>
        </div>
    );
};
