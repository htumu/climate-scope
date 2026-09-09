export function formatMetric(metric: string): string {
    return metric
        .split('_')
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(' ')
}

export type MetricGuide = {
    description: string
    scale: string
    lowerLabel: string
    higherLabel: string
    higherIsBetter: boolean
}

export const METRIC_GUIDE: Record<string, MetricGuide> = {
    gain: {
        description: 'Overall ND-GAIN score combining climate vulnerability and readiness.',
        scale: 'Approximately 0 to 100',
        lowerLabel: 'Lower overall position',
        higherLabel: 'Higher overall position',
        higherIsBetter: true,
    },
    vulnerability: {
        description: 'A country\'s exposure and sensitivity to climate impacts, balanced against its capacity to adapt.',
        scale: 'Approximately 0 to 1',
        lowerLabel: 'Lower risk',
        higherLabel: 'Higher risk',
        higherIsBetter: false,
    },
    readiness: {
        description: 'A country\'s ability to translate investment and policy into adaptation action.',
        scale: 'Approximately 0 to 1',
        lowerLabel: 'Less prepared',
        higherLabel: 'More prepared',
        higherIsBetter: true,
    },
    economic_readiness: {
        description: 'Economic conditions that support a country\'s ability to adapt to climate change.',
        scale: 'Approximately 0 to 1',
        lowerLabel: 'Lower capacity',
        higherLabel: 'Higher capacity',
        higherIsBetter: true,
    },
    governance_readiness: {
        description: 'Government and institutional conditions that support effective climate adaptation.',
        scale: 'Approximately 0 to 1',
        lowerLabel: 'Weaker institutions',
        higherLabel: 'Stronger institutions',
        higherIsBetter: true,
    },
    social_readiness: {
        description: 'Social conditions, education, and inclusion that affect how communities can respond to climate risks.',
        scale: 'Approximately 0 to 1',
        lowerLabel: 'Lower social capacity',
        higherLabel: 'Higher social capacity',
        higherIsBetter: true,
    },
}
