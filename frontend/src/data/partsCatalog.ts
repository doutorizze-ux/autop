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

// A base interna deve ser abastecida apenas com codigos reais validados.
// Mantemos vazia por padrao para evitar sugestoes erradas no balcão.
export const partsCatalog: CatalogFamily[] = [];

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
