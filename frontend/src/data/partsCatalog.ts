export type CatalogApplication = {
    code: string;
    brand: string;
    model: string;
    years: string;
    engine?: string;
    note?: string;
    aliases?: string[];
};

export type CatalogFamily = {
    id: string;
    name: string;
    category: string;
    position?: string;
    aliases?: string[];
    applications: CatalogApplication[];
};

export type CatalogSuggestion = {
    family: CatalogFamily;
    applications: CatalogApplication[];
    score: number;
};

export const partsCatalog: CatalogFamily[] = [
    {
        id: 'amortecedor-dianteiro',
        name: 'Amortecedor dianteiro',
        category: 'Suspensao',
        position: 'Dianteira',
        aliases: ['amortecedor dianteiro', 'amortecedor frente', 'par amortecedor dianteiro'],
        applications: [
            { code: 'AMT-COR-992', brand: 'Toyota', model: 'Corolla', years: '2020-2024', engine: '2.0', aliases: ['amortecedor corolla 2020'] },
            { code: 'AMT-HIL-441', brand: 'Toyota', model: 'Hilux', years: '2021-2024', engine: '2.8 Diesel', aliases: ['amortecedor hilux 2022'] },
            { code: 'AMT-CIV-380', brand: 'Honda', model: 'Civic', years: '2017-2021', engine: '2.0', aliases: ['amortecedor civic 2019'] },
            { code: 'AMT-CRV-511', brand: 'Honda', model: 'CR-V', years: '2018-2022', engine: '1.5 Turbo', aliases: ['amortecedor crv'] },
            { code: 'AMT-ONX-714', brand: 'Chevrolet', model: 'Onix', years: '2020-2025', engine: '1.0 Turbo', aliases: ['amortecedor onix turbo'] },
            { code: 'AMT-CRU-801', brand: 'Chevrolet', model: 'Cruze', years: '2017-2022', engine: '1.4 Turbo', aliases: ['amortecedor cruze'] },
            { code: 'AMT-GOL-277', brand: 'Volkswagen', model: 'Gol', years: '2019-2022', engine: '1.6', aliases: ['amortecedor gol 2021'] },
            { code: 'AMT-ARG-448', brand: 'Fiat', model: 'Argo', years: '2018-2024', engine: '1.3', aliases: ['amortecedor argo'] },
        ],
    },
    {
        id: 'pastilha-freio-dianteira',
        name: 'Pastilha de freio dianteira',
        category: 'Freio',
        position: 'Dianteira',
        aliases: ['pastilha dianteira', 'pastilha freio dianteira'],
        applications: [
            { code: 'PDH-2201', brand: 'Toyota', model: 'Hilux', years: '2021-2024', engine: '2.8 Diesel', aliases: ['pastilha hilux 2022'] },
            { code: 'PDF-COR-540', brand: 'Toyota', model: 'Corolla', years: '2020-2024', engine: '2.0', aliases: ['pastilha corolla 2021'] },
            { code: 'PDF-CIV-320', brand: 'Honda', model: 'Civic', years: '2017-2021', engine: '2.0', aliases: ['pastilha civic 2019'] },
            { code: 'PDF-CRU-612', brand: 'Chevrolet', model: 'Cruze', years: '2017-2022', engine: '1.4 Turbo', aliases: ['pastilha cruze'] },
            { code: 'PDF-REN-244', brand: 'Jeep', model: 'Renegade', years: '2019-2024', engine: '1.8', aliases: ['pastilha renegade'] },
            { code: 'PDF-CMP-718', brand: 'Jeep', model: 'Compass', years: '2019-2024', engine: '2.0 Diesel', aliases: ['pastilha compass diesel'] },
        ],
    },
    {
        id: 'disco-freio-dianteiro',
        name: 'Disco de freio dianteiro ventilado',
        category: 'Freio',
        position: 'Dianteira',
        aliases: ['disco dianteiro', 'disco de freio dianteiro'],
        applications: [
            { code: 'DSC-CVC-018', brand: 'Honda', model: 'Civic', years: '2017-2021', engine: '2.0', aliases: ['disco civic 2019'] },
            { code: 'DSC-COR-201', brand: 'Toyota', model: 'Corolla', years: '2020-2024', engine: '2.0', aliases: ['disco corolla'] },
            { code: 'DSC-CRU-305', brand: 'Chevrolet', model: 'Cruze', years: '2017-2022', engine: '1.4 Turbo', aliases: ['disco cruze'] },
            { code: 'DSC-HRV-440', brand: 'Honda', model: 'HR-V', years: '2019-2024', engine: '1.8', aliases: ['disco hrv'] },
        ],
    },
    {
        id: 'filtro-oleo',
        name: 'Filtro de oleo',
        category: 'Filtros',
        aliases: ['filtro oleo', 'filtro de oleo', 'filtro do oleo'],
        applications: [
            { code: 'FLT-OL-GOL-1', brand: 'Volkswagen', model: 'Gol', years: '2019-2022', engine: '1.6', aliases: ['filtro gol 2021'] },
            { code: 'FLT-OL-ONX-7', brand: 'Chevrolet', model: 'Onix', years: '2020-2025', engine: '1.0 Turbo', aliases: ['filtro oleo onix turbo'] },
            { code: 'FLT-OL-COR-4', brand: 'Toyota', model: 'Corolla', years: '2020-2024', engine: '2.0', aliases: ['filtro oleo corolla'] },
            { code: 'FLT-OL-HIL-9', brand: 'Toyota', model: 'Hilux', years: '2021-2024', engine: '2.8 Diesel', aliases: ['filtro oleo hilux diesel'] },
            { code: 'FLT-OL-TOR-5', brand: 'Fiat', model: 'Toro', years: '2019-2024', engine: '1.8', aliases: ['filtro oleo toro'] },
        ],
    },
    {
        id: 'filtro-ar-motor',
        name: 'Filtro de ar do motor',
        category: 'Filtros',
        aliases: ['filtro ar motor', 'filtro do motor'],
        applications: [
            { code: 'FLT-AR-ONX-19', brand: 'Chevrolet', model: 'Onix', years: '2020-2025', engine: '1.0 Turbo', aliases: ['filtro ar onix'] },
            { code: 'FLT-AR-COR-12', brand: 'Toyota', model: 'Corolla', years: '2020-2024', engine: '2.0', aliases: ['filtro ar corolla'] },
            { code: 'FLT-AR-CIV-33', brand: 'Honda', model: 'Civic', years: '2017-2021', engine: '2.0', aliases: ['filtro ar civic'] },
            { code: 'FLT-AR-REN-28', brand: 'Jeep', model: 'Renegade', years: '2019-2024', engine: '1.8', aliases: ['filtro ar renegade'] },
        ],
    },
    {
        id: 'kit-embreagem',
        name: 'Kit embreagem completo',
        category: 'Transmissao',
        aliases: ['kit embreagem', 'embreagem completa'],
        applications: [
            { code: 'KIT-EMB-HRV-55', brand: 'Honda', model: 'HR-V', years: '2016-2020', engine: '1.8', aliases: ['embreagem hrv'] },
            { code: 'KIT-EMB-STR-22', brand: 'Fiat', model: 'Strada', years: '2018-2023', engine: '1.4', aliases: ['embreagem strada'] },
            { code: 'KIT-EMB-GOL-14', brand: 'Volkswagen', model: 'Gol', years: '2018-2022', engine: '1.6', aliases: ['embreagem gol'] },
            { code: 'KIT-EMB-FOX-29', brand: 'Volkswagen', model: 'Fox', years: '2017-2021', engine: '1.6', aliases: ['embreagem fox'] },
        ],
    },
];

const normalize = (value: string) =>
    String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

const isNonEmptyString = (value: string | undefined | null): value is string => !!value;

const buildApplicationLabel = (application: CatalogApplication) =>
    [application.brand, application.model, application.years, application.engine].filter(Boolean).join(' ');

export function searchPartsCatalog(term: string, limit = 5) {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) return [] as CatalogSuggestion[];

    return partsCatalog
        .map((family) => {
            const familyTerms = [family.name, family.category, family.position, ...(family.aliases || [])]
                .filter(isNonEmptyString)
                .map(normalize);

            let familyScore = 0;

            familyTerms.forEach((value) => {
                if (value === normalizedTerm) familyScore += 120;
                else if (value.startsWith(normalizedTerm)) familyScore += 80;
                else if (value.includes(normalizedTerm)) familyScore += 45;
            });

            const applications = family.applications
                .map((application) => {
                    const applicationTerms = [
                        application.code,
                        application.brand,
                        application.model,
                        application.years,
                        application.engine,
                        application.note,
                        buildApplicationLabel(application),
                        ...(application.aliases || []),
                    ]
                        .filter(isNonEmptyString)
                        .map(normalize);

                    let score = familyScore;

                    applicationTerms.forEach((value) => {
                        if (value === normalizedTerm) score += 140;
                        else if (value.startsWith(normalizedTerm)) score += 90;
                        else if (value.includes(normalizedTerm)) score += 50;
                    });

                    return { application, score };
                })
                .filter((entry) => entry.score > 0)
                .sort((a, b) => b.score - a.score);

            if (applications.length === 0 && familyScore === 0) {
                return null;
            }

            const visibleApplications = applications.length > 0
                ? applications.slice(0, 8).map((entry) => entry.application)
                : family.applications.slice(0, 6);

            return {
                family,
                applications: visibleApplications,
                score: applications[0]?.score || familyScore,
            } satisfies CatalogSuggestion;
        })
        .filter((entry): entry is CatalogSuggestion => !!entry)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit);
}
