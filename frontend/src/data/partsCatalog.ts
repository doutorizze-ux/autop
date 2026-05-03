export type CatalogPart = {
    code: string;
    name: string;
    application: string;
    aliases?: string[];
};

export const partsCatalog: CatalogPart[] = [
    { code: 'PDH-2201', name: 'Pastilha de freio dianteira', application: 'Hilux 2022 2.8 Diesel', aliases: ['pastilha dianteira hilux 2022', 'pastilha freio dianteira hilux'] },
    { code: 'PTH-2202', name: 'Pastilha de freio traseira', application: 'Hilux 2022 2.8 Diesel', aliases: ['pastilha traseira hilux 2022'] },
    { code: 'DSC-CVC-018', name: 'Disco de freio dianteiro ventilado', application: 'Civic 2019 2.0', aliases: ['disco dianteiro civic 2019', 'disco freio civic'] },
    { code: 'AMT-COR-992', name: 'Amortecedor dianteiro', application: 'Corolla 2020 2.0', aliases: ['amortecedor dianteiro corolla 2020'] },
    { code: 'KIT-EMB-HRV-55', name: 'Kit embreagem completo', application: 'HR-V 1.8 2018', aliases: ['embreagem hrv 2018', 'kit embreagem hrv'] },
    { code: 'FLT-OL-GOL-1', name: 'Filtro de oleo', application: 'Gol 1.6 2021', aliases: ['filtro oleo gol 2021', 'filtro de óleo gol'] },
    { code: 'FLT-AR-ONX-19', name: 'Filtro de ar do motor', application: 'Onix 1.0 Turbo 2023', aliases: ['filtro ar onix turbo', 'filtro do motor onix'] },
    { code: 'FLT-CAB-JEE-07', name: 'Filtro de cabine', application: 'Jeep Renegade 2021', aliases: ['filtro ar condicionado renegade', 'filtro cabine jeep'] },
    { code: 'BMB-AG-CRE-91', name: 'Bomba dagua', application: 'Creta 1.6 2020', aliases: ['bomba dagua creta', 'bomba de água creta'] },
    { code: 'RDL-FOX-330', name: 'Radiador', application: 'Fox 1.6 2017', aliases: ['radiador fox 2017'] },
    { code: 'BRC-STR-119', name: 'Braco axial direcao', application: 'Strada 1.4 2020', aliases: ['braco axial strada', 'braço axial strada'] },
    { code: 'TRM-ARO-455', name: 'Terminal de direcao', application: 'Argo 1.3 2022', aliases: ['terminal direcao argo', 'terminal de direção argo'] },
    { code: 'PIV-TRK-820', name: 'Pivo de suspensao', application: 'Tracker 2021', aliases: ['pivo tracker 2021', 'pivô tracker'] },
    { code: 'BND-HON-212', name: 'Bandeja dianteira completa', application: 'Honda Fit 2018', aliases: ['bandeja fit 2018', 'bandeja dianteira fit'] },
    { code: 'VLV-TERM-09', name: 'Valvula termostatica', application: 'Toro 1.8 2021', aliases: ['valvula termostatica toro', 'válvula termostática toro'] },
    { code: 'SNS-ABS-CRU-5', name: 'Sensor ABS dianteiro', application: 'Cruze 2018', aliases: ['sensor abs cruze', 'sensor abs dianteiro cruze'] },
    { code: 'BTA-MOU-71', name: 'Bateria 70Ah', application: 'Uso universal leve', aliases: ['bateria 70 amperes', 'bateria 70ah'] },
    { code: 'ALN-COM-14', name: 'Alternador completo', application: 'Compass 2.0 Diesel 2020', aliases: ['alternador compass diesel', 'alternador jeep compass'] },
    { code: 'MLA-S10-818', name: 'Motor limpador dianteiro', application: 'S10 2021', aliases: ['motor limpador s10', 'motor limpador parabrisa s10'] },
    { code: 'CXD-RAN-314', name: 'Coxim do motor direito', application: 'Ranger 3.2 2020', aliases: ['coxim motor ranger', 'coxim direito ranger'] },
];

const normalize = (value: string) =>
    String(value || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .trim();

export function searchPartsCatalog(term: string, limit = 6) {
    const normalizedTerm = normalize(term);
    if (!normalizedTerm) return [];

    return partsCatalog
        .map((part) => {
            const haystacks = [part.code, part.name, part.application, ...(part.aliases || [])].map(normalize);
            let score = 0;

            haystacks.forEach((value) => {
                if (value === normalizedTerm) score += 120;
                else if (value.startsWith(normalizedTerm)) score += 70;
                else if (value.includes(normalizedTerm)) score += 35;
            });

            if (normalize(part.name).includes(normalizedTerm) && normalize(part.name).split(' ').length >= normalizedTerm.split(' ').length) {
                score += 25;
            }

            return { part, score };
        })
        .filter((entry) => entry.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, limit)
        .map((entry) => entry.part);
}
