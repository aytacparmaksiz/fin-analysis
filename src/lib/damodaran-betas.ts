/**
 * NYU Stern - Prof. Aswath Damodaran Global Betas & Capital Structure Dataset
 * Kaynak: https://pages.stern.nyu.edu/~adamodar/New_Home_Page/datafile/Betas.html
 * Dosya: Betas.xls / Global Industry Betas & Capital Structure
 */

export interface DamodaranIndustryRecord {
  industryName: string;
  numberOfFirms: number;
  beta: number;
  deRatio: number; // %
  effectiveTaxRate: number; // %
  unleveredBeta: number;
  cashToFirmValue: number; // %
  unleveredBetaCashCorrected: number;
  hiloRisk?: number;
  stdDevEquity?: number;
  stdDevOperatingIncome?: number;
}

export const DAMODARAN_GLOBAL_BETAS: DamodaranIndustryRecord[] = [
  {
    "industryName": "Advertising",
    "numberOfFirms": 52,
    "beta": 1.21,
    "deRatio": 40.2,
    "effectiveTaxRate": 5.02,
    "unleveredBeta": 0.93,
    "cashToFirmValue": 7.73,
    "unleveredBetaCashCorrected": 1.01,
    "hiloRisk": 0.6233,
    "stdDevEquity": 62.91,
    "stdDevOperatingIncome": 15.17
  },
  {
    "industryName": "Aerospace/Defense",
    "numberOfFirms": 79,
    "beta": 0.95,
    "deRatio": 15.56,
    "effectiveTaxRate": 11.58,
    "unleveredBeta": 0.85,
    "cashToFirmValue": 2.61,
    "unleveredBetaCashCorrected": 0.87,
    "hiloRisk": 0.5213,
    "stdDevEquity": 46.45,
    "stdDevOperatingIncome": 21.86
  },
  {
    "industryName": "Air Transport",
    "numberOfFirms": 23,
    "beta": 1.19,
    "deRatio": 91.17,
    "effectiveTaxRate": 8.29,
    "unleveredBeta": 0.7,
    "cashToFirmValue": 7.11,
    "unleveredBetaCashCorrected": 0.76,
    "hiloRisk": 0.5152,
    "stdDevEquity": 59,
    "stdDevOperatingIncome": 210.43
  },
  {
    "industryName": "Apparel",
    "numberOfFirms": 35,
    "beta": 0.94,
    "deRatio": 31.29,
    "effectiveTaxRate": 9.61,
    "unleveredBeta": 0.76,
    "cashToFirmValue": 4.6,
    "unleveredBetaCashCorrected": 0.79,
    "hiloRisk": 0.5786,
    "stdDevEquity": 46.26,
    "stdDevOperatingIncome": 26.8
  },
  {
    "industryName": "Auto & Truck",
    "numberOfFirms": 33,
    "beta": 1.46,
    "deRatio": 19.7,
    "effectiveTaxRate": 3.74,
    "unleveredBeta": 1.27,
    "cashToFirmValue": 2.99,
    "unleveredBetaCashCorrected": 1.31,
    "hiloRisk": 0.7242,
    "stdDevEquity": 61.83,
    "stdDevOperatingIncome": 38.88
  },
  {
    "industryName": "Auto Parts",
    "numberOfFirms": 35,
    "beta": 1.34,
    "deRatio": 41.46,
    "effectiveTaxRate": 15,
    "unleveredBeta": 1.02,
    "cashToFirmValue": 9.45,
    "unleveredBetaCashCorrected": 1.13,
    "hiloRisk": 0.5243,
    "stdDevEquity": 49.87,
    "stdDevOperatingIncome": 21.22
  },
  {
    "industryName": "Bank (Money Center)",
    "numberOfFirms": 15,
    "beta": 0.76,
    "deRatio": 164.19,
    "effectiveTaxRate": 18.43,
    "unleveredBeta": 0.34,
    "cashToFirmValue": 23.17,
    "unleveredBetaCashCorrected": 0.44,
    "hiloRisk": 0.231,
    "stdDevEquity": 22.74
  },
  {
    "industryName": "Banks (Regional)",
    "numberOfFirms": 568,
    "beta": 0.4,
    "deRatio": 52.1,
    "effectiveTaxRate": 17.61,
    "unleveredBeta": 0.29,
    "cashToFirmValue": 23.48,
    "unleveredBetaCashCorrected": 0.37,
    "hiloRisk": 0.1917,
    "stdDevEquity": 22.68,
    "stdDevOperatingIncome": 55.33
  },
  {
    "industryName": "Beverage (Alcoholic)",
    "numberOfFirms": 14,
    "beta": 0.81,
    "deRatio": 43.34,
    "effectiveTaxRate": 12.35,
    "unleveredBeta": 0.61,
    "cashToFirmValue": 2.37,
    "unleveredBetaCashCorrected": 0.63,
    "hiloRisk": 0.583,
    "stdDevEquity": 55.96,
    "stdDevOperatingIncome": 18.74
  },
  {
    "industryName": "Beverage (Soft)",
    "numberOfFirms": 27,
    "beta": 0.64,
    "deRatio": 20.59,
    "effectiveTaxRate": 6.85,
    "unleveredBeta": 0.56,
    "cashToFirmValue": 3.44,
    "unleveredBetaCashCorrected": 0.58,
    "hiloRisk": 0.6187,
    "stdDevEquity": 57.89,
    "stdDevOperatingIncome": 18.65
  },
  {
    "industryName": "Broadcasting",
    "numberOfFirms": 24,
    "beta": 0.47,
    "deRatio": 85.85,
    "effectiveTaxRate": 7.73,
    "unleveredBeta": 0.29,
    "cashToFirmValue": 9.18,
    "unleveredBetaCashCorrected": 0.32,
    "hiloRisk": 0.5721,
    "stdDevEquity": 46.62,
    "stdDevOperatingIncome": 24.68
  },
  {
    "industryName": "Brokerage & Investment Banking",
    "numberOfFirms": 32,
    "beta": 1.17,
    "deRatio": 135.57,
    "effectiveTaxRate": 15.27,
    "unleveredBeta": 0.58,
    "cashToFirmValue": 14.51,
    "unleveredBetaCashCorrected": 0.68,
    "hiloRisk": 0.4221,
    "stdDevEquity": 36.61
  },
  {
    "industryName": "Building Materials",
    "numberOfFirms": 41,
    "beta": 1.11,
    "deRatio": 26,
    "effectiveTaxRate": 18.02,
    "unleveredBeta": 0.93,
    "cashToFirmValue": 3.16,
    "unleveredBetaCashCorrected": 0.96,
    "hiloRisk": 0.4099,
    "stdDevEquity": 35.28,
    "stdDevOperatingIncome": 38.06
  },
  {
    "industryName": "Business & Consumer Services",
    "numberOfFirms": 155,
    "beta": 0.89,
    "deRatio": 19.72,
    "effectiveTaxRate": 10.38,
    "unleveredBeta": 0.77,
    "cashToFirmValue": 4.02,
    "unleveredBetaCashCorrected": 0.81,
    "hiloRisk": 0.5302,
    "stdDevEquity": 41.11,
    "stdDevOperatingIncome": 27.1
  },
  {
    "industryName": "Cable TV",
    "numberOfFirms": 9,
    "beta": 0.74,
    "deRatio": 146.94,
    "effectiveTaxRate": 10.64,
    "unleveredBeta": 0.35,
    "cashToFirmValue": 2.89,
    "unleveredBetaCashCorrected": 0.36,
    "hiloRisk": 0.4441,
    "stdDevEquity": 44.04,
    "stdDevOperatingIncome": 26.88
  },
  {
    "industryName": "Chemical (Basic)",
    "numberOfFirms": 29,
    "beta": 1.01,
    "deRatio": 99.35,
    "effectiveTaxRate": 7.68,
    "unleveredBeta": 0.58,
    "cashToFirmValue": 8.91,
    "unleveredBetaCashCorrected": 0.64,
    "hiloRisk": 0.5354,
    "stdDevEquity": 45.81,
    "stdDevOperatingIncome": 39.28
  },
  {
    "industryName": "Chemical (Diversified)",
    "numberOfFirms": 4,
    "beta": 0.85,
    "deRatio": 176.11,
    "effectiveTaxRate": 0,
    "unleveredBeta": 0.37,
    "cashToFirmValue": 9.75,
    "unleveredBetaCashCorrected": 0.41,
    "hiloRisk": 0.423,
    "stdDevEquity": 39.04,
    "stdDevOperatingIncome": 45.64
  },
  {
    "industryName": "Chemical (Specialty)",
    "numberOfFirms": 59,
    "beta": 0.97,
    "deRatio": 29.88,
    "effectiveTaxRate": 13.68,
    "unleveredBeta": 0.79,
    "cashToFirmValue": 3.91,
    "unleveredBetaCashCorrected": 0.82,
    "hiloRisk": 0.4095,
    "stdDevEquity": 42.31,
    "stdDevOperatingIncome": 21.76
  },
  {
    "industryName": "Coal & Related Energy",
    "numberOfFirms": 16,
    "beta": 1.07,
    "deRatio": 7.14,
    "effectiveTaxRate": 3.13,
    "unleveredBeta": 1.02,
    "cashToFirmValue": 14.03,
    "unleveredBetaCashCorrected": 1.18,
    "hiloRisk": 0.6619,
    "stdDevEquity": 64.31,
    "stdDevOperatingIncome": 242.5
  },
  {
    "industryName": "Computer Services",
    "numberOfFirms": 64,
    "beta": 1.09,
    "deRatio": 25.1,
    "effectiveTaxRate": 10.53,
    "unleveredBeta": 0.92,
    "cashToFirmValue": 4.8,
    "unleveredBetaCashCorrected": 0.96,
    "hiloRisk": 0.5715,
    "stdDevEquity": 53.43,
    "stdDevOperatingIncome": 19.63
  },
  {
    "industryName": "Computers/Peripherals",
    "numberOfFirms": 36,
    "beta": 1.35,
    "deRatio": 4.62,
    "effectiveTaxRate": 5.91,
    "unleveredBeta": 1.31,
    "cashToFirmValue": 1.47,
    "unleveredBetaCashCorrected": 1.32,
    "hiloRisk": 0.5571,
    "stdDevEquity": 54.58,
    "stdDevOperatingIncome": 30.57
  },
  {
    "industryName": "Construction Supplies",
    "numberOfFirms": 40,
    "beta": 1.15,
    "deRatio": 17.62,
    "effectiveTaxRate": 16.04,
    "unleveredBeta": 1.02,
    "cashToFirmValue": 2.94,
    "unleveredBetaCashCorrected": 1.05,
    "hiloRisk": 0.4302,
    "stdDevEquity": 35.51,
    "stdDevOperatingIncome": 38.6
  },
  {
    "industryName": "Diversified",
    "numberOfFirms": 20,
    "beta": 0.88,
    "deRatio": 15.55,
    "effectiveTaxRate": 2.76,
    "unleveredBeta": 0.79,
    "cashToFirmValue": 6.42,
    "unleveredBetaCashCorrected": 0.84,
    "hiloRisk": 0.5558,
    "stdDevEquity": 28.41,
    "stdDevOperatingIncome": 69.9
  },
  {
    "industryName": "Drugs (Biotechnology)",
    "numberOfFirms": 496,
    "beta": 1.14,
    "deRatio": 13.04,
    "effectiveTaxRate": 1.08,
    "unleveredBeta": 1.03,
    "cashToFirmValue": 4.2,
    "unleveredBetaCashCorrected": 1.08,
    "hiloRisk": 0.6431,
    "stdDevEquity": 75.68,
    "stdDevOperatingIncome": 40.52
  },
  {
    "industryName": "Drugs (Pharmaceutical)",
    "numberOfFirms": 228,
    "beta": 0.98,
    "deRatio": 14.54,
    "effectiveTaxRate": 2.99,
    "unleveredBeta": 0.89,
    "cashToFirmValue": 3.16,
    "unleveredBetaCashCorrected": 0.92,
    "hiloRisk": 0.6841,
    "stdDevEquity": 76.64,
    "stdDevOperatingIncome": 26.77
  },
  {
    "industryName": "Education",
    "numberOfFirms": 32,
    "beta": 0.78,
    "deRatio": 24.38,
    "effectiveTaxRate": 15.54,
    "unleveredBeta": 0.66,
    "cashToFirmValue": 8.26,
    "unleveredBetaCashCorrected": 0.72,
    "hiloRisk": 0.5006,
    "stdDevEquity": 47.24,
    "stdDevOperatingIncome": 37.79
  },
  {
    "industryName": "Electrical Equipment",
    "numberOfFirms": 112,
    "beta": 1.25,
    "deRatio": 12,
    "effectiveTaxRate": 4.82,
    "unleveredBeta": 1.15,
    "cashToFirmValue": 3.53,
    "unleveredBetaCashCorrected": 1.19,
    "hiloRisk": 0.6771,
    "stdDevEquity": 72.71,
    "stdDevOperatingIncome": 19.79
  },
  {
    "industryName": "Electronics (Consumer & Office)",
    "numberOfFirms": 8,
    "beta": 0.87,
    "deRatio": 5.8,
    "effectiveTaxRate": 0,
    "unleveredBeta": 0.83,
    "cashToFirmValue": 10.52,
    "unleveredBetaCashCorrected": 0.93,
    "hiloRisk": 0.6314,
    "stdDevEquity": 70.18
  },
  {
    "industryName": "Electronics (General)",
    "numberOfFirms": 114,
    "beta": 0.97,
    "deRatio": 11.01,
    "effectiveTaxRate": 8.04,
    "unleveredBeta": 0.9,
    "cashToFirmValue": 4.28,
    "unleveredBetaCashCorrected": 0.94,
    "hiloRisk": 0.5332,
    "stdDevEquity": 51.84,
    "stdDevOperatingIncome": 25.55
  },
  {
    "industryName": "Engineering/Construction",
    "numberOfFirms": 48,
    "beta": 1.21,
    "deRatio": 14.01,
    "effectiveTaxRate": 13.64,
    "unleveredBeta": 1.09,
    "cashToFirmValue": 3.74,
    "unleveredBetaCashCorrected": 1.14,
    "hiloRisk": 0.4819,
    "stdDevEquity": 45.92,
    "stdDevOperatingIncome": 40.66
  },
  {
    "industryName": "Entertainment",
    "numberOfFirms": 92,
    "beta": 0.83,
    "deRatio": 15.91,
    "effectiveTaxRate": 3.3,
    "unleveredBeta": 0.74,
    "cashToFirmValue": 3.36,
    "unleveredBetaCashCorrected": 0.76,
    "hiloRisk": 0.6108,
    "stdDevEquity": 48.71,
    "stdDevOperatingIncome": 33.72
  },
  {
    "industryName": "Environmental & Waste Services",
    "numberOfFirms": 53,
    "beta": 0.95,
    "deRatio": 21.45,
    "effectiveTaxRate": 4.27,
    "unleveredBeta": 0.81,
    "cashToFirmValue": 1.25,
    "unleveredBetaCashCorrected": 0.82,
    "hiloRisk": 0.604,
    "stdDevEquity": 54.91,
    "stdDevOperatingIncome": 33.05
  },
  {
    "industryName": "Farming/Agriculture",
    "numberOfFirms": 35,
    "beta": 1.13,
    "deRatio": 51.85,
    "effectiveTaxRate": 6.29,
    "unleveredBeta": 0.81,
    "cashToFirmValue": 3.87,
    "unleveredBetaCashCorrected": 0.85,
    "hiloRisk": 0.5709,
    "stdDevEquity": 50.79,
    "stdDevOperatingIncome": 49.7
  },
  {
    "industryName": "Financial Svcs. (Non-bank & Insur)",
    "numberOfFirms": 176,
    "beta": 0.97,
    "deRatio": 272.13,
    "effectiveTaxRate": 12.06,
    "unleveredBeta": 0.32,
    "cashToFirmValue": 2.69,
    "unleveredBetaCashCorrected": 0.33,
    "hiloRisk": 0.4484,
    "stdDevEquity": 42.47,
    "stdDevOperatingIncome": 33.72
  },
  {
    "industryName": "Food Processing",
    "numberOfFirms": 78,
    "beta": 0.61,
    "deRatio": 43.73,
    "effectiveTaxRate": 10.37,
    "unleveredBeta": 0.46,
    "cashToFirmValue": 2.56,
    "unleveredBetaCashCorrected": 0.47,
    "hiloRisk": 0.4859,
    "stdDevEquity": 43.47,
    "stdDevOperatingIncome": 9.38
  },
  {
    "industryName": "Food Wholesalers",
    "numberOfFirms": 13,
    "beta": 0.87,
    "deRatio": 46.97,
    "effectiveTaxRate": 9.15,
    "unleveredBeta": 0.64,
    "cashToFirmValue": 1.06,
    "unleveredBetaCashCorrected": 0.65,
    "hiloRisk": 0.5105,
    "stdDevEquity": 33.98,
    "stdDevOperatingIncome": 35.62
  },
  {
    "industryName": "Furn/Home Furnishings",
    "numberOfFirms": 27,
    "beta": 0.82,
    "deRatio": 42.33,
    "effectiveTaxRate": 11.38,
    "unleveredBeta": 0.62,
    "cashToFirmValue": 4.19,
    "unleveredBetaCashCorrected": 0.65,
    "hiloRisk": 0.4719,
    "stdDevEquity": 51.51,
    "stdDevOperatingIncome": 20.43
  },
  {
    "industryName": "Green & Renewable Energy",
    "numberOfFirms": 15,
    "beta": 0.86,
    "deRatio": 113.11,
    "effectiveTaxRate": 0,
    "unleveredBeta": 0.46,
    "cashToFirmValue": 1.9,
    "unleveredBetaCashCorrected": 0.47,
    "hiloRisk": 0.731,
    "stdDevEquity": 65.14,
    "stdDevOperatingIncome": 28.78
  },
  {
    "industryName": "Healthcare Products",
    "numberOfFirms": 204,
    "beta": 0.91,
    "deRatio": 12.79,
    "effectiveTaxRate": 4.85,
    "unleveredBeta": 0.83,
    "cashToFirmValue": 3.25,
    "unleveredBetaCashCorrected": 0.86,
    "hiloRisk": 0.559,
    "stdDevEquity": 61.79,
    "stdDevOperatingIncome": 30.9
  },
  {
    "industryName": "Healthcare Support Services",
    "numberOfFirms": 104,
    "beta": 0.87,
    "deRatio": 35.43,
    "effectiveTaxRate": 9.8,
    "unleveredBeta": 0.69,
    "cashToFirmValue": 7.51,
    "unleveredBetaCashCorrected": 0.74,
    "hiloRisk": 0.523,
    "stdDevEquity": 47.24,
    "stdDevOperatingIncome": 24.13
  },
  {
    "industryName": "Heathcare Information and Techno",
    "numberOfFirms": 115,
    "beta": 1.11,
    "deRatio": 15.74,
    "effectiveTaxRate": 6.38,
    "unleveredBeta": 0.99,
    "cashToFirmValue": 2.46,
    "unleveredBetaCashCorrected": 1.02,
    "hiloRisk": 0.5788,
    "stdDevEquity": 63.78,
    "stdDevOperatingIncome": 35.53
  },
  {
    "industryName": "Homebuilding",
    "numberOfFirms": 30,
    "beta": 0.91,
    "deRatio": 21.34,
    "effectiveTaxRate": 16.99,
    "unleveredBeta": 0.78,
    "cashToFirmValue": 8,
    "unleveredBetaCashCorrected": 0.85,
    "hiloRisk": 0.3682,
    "stdDevEquity": 32.79,
    "stdDevOperatingIncome": 59.59
  },
  {
    "industryName": "Hospitals/Healthcare Facilities",
    "numberOfFirms": 31,
    "beta": 0.8,
    "deRatio": 59.92,
    "effectiveTaxRate": 11.35,
    "unleveredBeta": 0.55,
    "cashToFirmValue": 2.32,
    "unleveredBetaCashCorrected": 0.56,
    "hiloRisk": 0.5198,
    "stdDevEquity": 56.46,
    "stdDevOperatingIncome": 20.29
  },
  {
    "industryName": "Hotel/Gaming",
    "numberOfFirms": 63,
    "beta": 1.08,
    "deRatio": 39.75,
    "effectiveTaxRate": 8.31,
    "unleveredBeta": 0.83,
    "cashToFirmValue": 4.96,
    "unleveredBetaCashCorrected": 0.88,
    "hiloRisk": 0.4804,
    "stdDevEquity": 39.65,
    "stdDevOperatingIncome": 99.05
  },
  {
    "industryName": "Household Products",
    "numberOfFirms": 110,
    "beta": 0.82,
    "deRatio": 18.15,
    "effectiveTaxRate": 6.5,
    "unleveredBeta": 0.72,
    "cashToFirmValue": 3.14,
    "unleveredBetaCashCorrected": 0.74,
    "hiloRisk": 0.6273,
    "stdDevEquity": 55.46,
    "stdDevOperatingIncome": 12.19
  },
  {
    "industryName": "Information Services",
    "numberOfFirms": 15,
    "beta": 0.92,
    "deRatio": 33.17,
    "effectiveTaxRate": 18.16,
    "unleveredBeta": 0.74,
    "cashToFirmValue": 2.54,
    "unleveredBetaCashCorrected": 0.76,
    "hiloRisk": 0.4395,
    "stdDevEquity": 32.38,
    "stdDevOperatingIncome": 40.82
  },
  {
    "industryName": "Insurance (General)",
    "numberOfFirms": 21,
    "beta": 0.67,
    "deRatio": 25.63,
    "effectiveTaxRate": 12.77,
    "unleveredBeta": 0.56,
    "cashToFirmValue": 2.5,
    "unleveredBetaCashCorrected": 0.58,
    "hiloRisk": 0.4201,
    "stdDevEquity": 46.07,
    "stdDevOperatingIncome": 42.1
  },
  {
    "industryName": "Insurance (Life)",
    "numberOfFirms": 20,
    "beta": 0.64,
    "deRatio": 67.84,
    "effectiveTaxRate": 15.19,
    "unleveredBeta": 0.43,
    "cashToFirmValue": 19.67,
    "unleveredBetaCashCorrected": 0.53,
    "hiloRisk": 0.2318,
    "stdDevEquity": 35.15,
    "stdDevOperatingIncome": 28.26
  },
  {
    "industryName": "Insurance (Prop/Cas.)",
    "numberOfFirms": 57,
    "beta": 0.48,
    "deRatio": 14.83,
    "effectiveTaxRate": 18.37,
    "unleveredBeta": 0.44,
    "cashToFirmValue": 4.68,
    "unleveredBetaCashCorrected": 0.46,
    "hiloRisk": 0.2677,
    "stdDevEquity": 28.7,
    "stdDevOperatingIncome": 37.9
  },
  {
    "industryName": "Investments & Asset Management",
    "numberOfFirms": 283,
    "beta": 0.66,
    "deRatio": 32.69,
    "effectiveTaxRate": 3.53,
    "unleveredBeta": 0.53,
    "cashToFirmValue": 9.92,
    "unleveredBetaCashCorrected": 0.59,
    "hiloRisk": 0.2498,
    "stdDevEquity": 30.04,
    "stdDevOperatingIncome": 23.01
  },
  {
    "industryName": "Machinery",
    "numberOfFirms": 105,
    "beta": 0.96,
    "deRatio": 14.69,
    "effectiveTaxRate": 13.37,
    "unleveredBeta": 0.87,
    "cashToFirmValue": 2.91,
    "unleveredBetaCashCorrected": 0.89,
    "hiloRisk": 0.4387,
    "stdDevEquity": 45.03,
    "stdDevOperatingIncome": 23.4
  },
  {
    "industryName": "Metals & Mining",
    "numberOfFirms": 73,
    "beta": 1.04,
    "deRatio": 10.98,
    "effectiveTaxRate": 2.52,
    "unleveredBeta": 0.96,
    "cashToFirmValue": 4.63,
    "unleveredBetaCashCorrected": 1.01,
    "hiloRisk": 0.7047,
    "stdDevEquity": 77.56,
    "stdDevOperatingIncome": 53.67
  },
  {
    "industryName": "Office Equipment & Services",
    "numberOfFirms": 14,
    "beta": 1.33,
    "deRatio": 48.1,
    "effectiveTaxRate": 12.3,
    "unleveredBeta": 0.98,
    "cashToFirmValue": 5.55,
    "unleveredBetaCashCorrected": 1.04,
    "hiloRisk": 0.4265,
    "stdDevEquity": 39.61,
    "stdDevOperatingIncome": 14.22
  },
  {
    "industryName": "Oil/Gas (Integrated)",
    "numberOfFirms": 4,
    "beta": 0.3,
    "deRatio": 13.85,
    "effectiveTaxRate": 28.24,
    "unleveredBeta": 0.27,
    "cashToFirmValue": 2.44,
    "unleveredBetaCashCorrected": 0.28,
    "hiloRisk": 0.1572,
    "stdDevEquity": 20.27,
    "stdDevOperatingIncome": 106.56
  },
  {
    "industryName": "Oil/Gas (Production and Exploratio",
    "numberOfFirms": 142,
    "beta": 0.72,
    "deRatio": 37.59,
    "effectiveTaxRate": 6.66,
    "unleveredBeta": 0.56,
    "cashToFirmValue": 2.73,
    "unleveredBetaCashCorrected": 0.58,
    "hiloRisk": 0.5045,
    "stdDevEquity": 42.22,
    "stdDevOperatingIncome": 185.49
  },
  {
    "industryName": "Oil/Gas Distribution",
    "numberOfFirms": 23,
    "beta": 0.67,
    "deRatio": 58.53,
    "effectiveTaxRate": 9.17,
    "unleveredBeta": 0.47,
    "cashToFirmValue": 0.89,
    "unleveredBetaCashCorrected": 0.47,
    "hiloRisk": 0.4565,
    "stdDevEquity": 42.24,
    "stdDevOperatingIncome": 56.92
  },
  {
    "industryName": "Oilfield Svcs/Equip.",
    "numberOfFirms": 97,
    "beta": 0.95,
    "deRatio": 37.36,
    "effectiveTaxRate": 8.75,
    "unleveredBeta": 0.74,
    "cashToFirmValue": 5.59,
    "unleveredBetaCashCorrected": 0.79,
    "hiloRisk": 0.4766,
    "stdDevEquity": 48.32,
    "stdDevOperatingIncome": 82.21
  },
  {
    "industryName": "Packaging & Container",
    "numberOfFirms": 19,
    "beta": 1.02,
    "deRatio": 55.11,
    "effectiveTaxRate": 15.57,
    "unleveredBeta": 0.72,
    "cashToFirmValue": 3.46,
    "unleveredBetaCashCorrected": 0.75,
    "hiloRisk": 0.3815,
    "stdDevEquity": 25.45,
    "stdDevOperatingIncome": 13.14
  },
  {
    "industryName": "Paper/Forest Products",
    "numberOfFirms": 6,
    "beta": 0.96,
    "deRatio": 43.69,
    "effectiveTaxRate": 8.6,
    "unleveredBeta": 0.72,
    "cashToFirmValue": 6.25,
    "unleveredBetaCashCorrected": 0.77,
    "hiloRisk": 0.4671,
    "stdDevEquity": 56.94,
    "stdDevOperatingIncome": 67.29
  },
  {
    "industryName": "Power",
    "numberOfFirms": 46,
    "beta": 0.48,
    "deRatio": 74.15,
    "effectiveTaxRate": 12.75,
    "unleveredBeta": 0.31,
    "cashToFirmValue": 1.45,
    "unleveredBetaCashCorrected": 0.31,
    "hiloRisk": 0.2234,
    "stdDevEquity": 25.38,
    "stdDevOperatingIncome": 17.04
  },
  {
    "industryName": "Precious Metals",
    "numberOfFirms": 56,
    "beta": 0.84,
    "deRatio": 7.28,
    "effectiveTaxRate": 5.97,
    "unleveredBeta": 0.79,
    "cashToFirmValue": 4.53,
    "unleveredBetaCashCorrected": 0.83,
    "hiloRisk": 0.7327,
    "stdDevEquity": 69.95,
    "stdDevOperatingIncome": 67.6
  },
  {
    "industryName": "Publishing & Newspapers",
    "numberOfFirms": 19,
    "beta": 0.56,
    "deRatio": 23.94,
    "effectiveTaxRate": 10.21,
    "unleveredBeta": 0.48,
    "cashToFirmValue": 6.75,
    "unleveredBetaCashCorrected": 0.51,
    "hiloRisk": 0.3069,
    "stdDevEquity": 35.93,
    "stdDevOperatingIncome": 12.15
  },
  {
    "industryName": "R.E.I.T.",
    "numberOfFirms": 190,
    "beta": 0.64,
    "deRatio": 84.46,
    "effectiveTaxRate": 1.58,
    "unleveredBeta": 0.39,
    "cashToFirmValue": 1.91,
    "unleveredBetaCashCorrected": 0.4,
    "hiloRisk": 0.2593,
    "stdDevEquity": 26.37,
    "stdDevOperatingIncome": 23.2
  },
  {
    "industryName": "Real Estate (Development)",
    "numberOfFirms": 14,
    "beta": 0.84,
    "deRatio": 101.83,
    "effectiveTaxRate": 4.91,
    "unleveredBeta": 0.48,
    "cashToFirmValue": 15.21,
    "unleveredBetaCashCorrected": 0.56,
    "hiloRisk": 0.607,
    "stdDevEquity": 52.1,
    "stdDevOperatingIncome": 81.39
  },
  {
    "industryName": "Real Estate (General/Diversified)",
    "numberOfFirms": 12,
    "beta": 0.81,
    "deRatio": 53.56,
    "effectiveTaxRate": 4.65,
    "unleveredBeta": 0.58,
    "cashToFirmValue": 7.83,
    "unleveredBetaCashCorrected": 0.63,
    "hiloRisk": 0.4625,
    "stdDevEquity": 31.21,
    "stdDevOperatingIncome": 46.67
  },
  {
    "industryName": "Real Estate (Operations & Service",
    "numberOfFirms": 54,
    "beta": 0.97,
    "deRatio": 24.64,
    "effectiveTaxRate": 8.7,
    "unleveredBeta": 0.81,
    "cashToFirmValue": 4.98,
    "unleveredBetaCashCorrected": 0.86,
    "hiloRisk": 0.4308,
    "stdDevEquity": 50.56,
    "stdDevOperatingIncome": 29.71
  },
  {
    "industryName": "Recreation",
    "numberOfFirms": 49,
    "beta": 1.02,
    "deRatio": 62.99,
    "effectiveTaxRate": 11.45,
    "unleveredBeta": 0.7,
    "cashToFirmValue": 5.62,
    "unleveredBetaCashCorrected": 0.74,
    "hiloRisk": 0.5365,
    "stdDevEquity": 48.31,
    "stdDevOperatingIncome": 25.09
  },
  {
    "industryName": "Reinsurance",
    "numberOfFirms": 1,
    "beta": 0.58,
    "deRatio": 43.47,
    "effectiveTaxRate": 30.36,
    "unleveredBeta": 0.44,
    "cashToFirmValue": 24.11,
    "unleveredBetaCashCorrected": 0.58,
    "hiloRisk": 0.188,
    "stdDevEquity": 19.21,
    "stdDevOperatingIncome": 21.97
  },
  {
    "industryName": "Restaurant/Dining",
    "numberOfFirms": 64,
    "beta": 0.92,
    "deRatio": 27.22,
    "effectiveTaxRate": 9.92,
    "unleveredBeta": 0.77,
    "cashToFirmValue": 1.99,
    "unleveredBetaCashCorrected": 0.78,
    "hiloRisk": 0.4914,
    "stdDevEquity": 41.15,
    "stdDevOperatingIncome": 22.1
  },
  {
    "industryName": "Retail (Automotive)",
    "numberOfFirms": 34,
    "beta": 0.94,
    "deRatio": 45.36,
    "effectiveTaxRate": 10.77,
    "unleveredBeta": 0.7,
    "cashToFirmValue": 2.08,
    "unleveredBetaCashCorrected": 0.71,
    "hiloRisk": 0.4825,
    "stdDevEquity": 44.58,
    "stdDevOperatingIncome": 29.76
  },
  {
    "industryName": "Retail (Building Supply)",
    "numberOfFirms": 14,
    "beta": 1.54,
    "deRatio": 23.29,
    "effectiveTaxRate": 11.84,
    "unleveredBeta": 1.31,
    "cashToFirmValue": 0.81,
    "unleveredBetaCashCorrected": 1.32,
    "hiloRisk": 0.3865,
    "stdDevEquity": 45.88,
    "stdDevOperatingIncome": 28.49
  },
  {
    "industryName": "Retail (Distributors)",
    "numberOfFirms": 62,
    "beta": 0.95,
    "deRatio": 28.24,
    "effectiveTaxRate": 14.59,
    "unleveredBeta": 0.78,
    "cashToFirmValue": 2.36,
    "unleveredBetaCashCorrected": 0.8,
    "hiloRisk": 0.433,
    "stdDevEquity": 39.29,
    "stdDevOperatingIncome": 38.7
  },
  {
    "industryName": "Retail (General)",
    "numberOfFirms": 23,
    "beta": 0.81,
    "deRatio": 7.94,
    "effectiveTaxRate": 19.1,
    "unleveredBeta": 0.76,
    "cashToFirmValue": 2.68,
    "unleveredBetaCashCorrected": 0.78,
    "hiloRisk": 0.3806,
    "stdDevEquity": 43.34,
    "stdDevOperatingIncome": 37.61
  },
  {
    "industryName": "Retail (Grocery and Food)",
    "numberOfFirms": 15,
    "beta": 1.12,
    "deRatio": 51.95,
    "effectiveTaxRate": 12.22,
    "unleveredBeta": 0.8,
    "cashToFirmValue": 5.14,
    "unleveredBetaCashCorrected": 0.85,
    "hiloRisk": 0.4158,
    "stdDevEquity": 49.42,
    "stdDevOperatingIncome": 33.4
  },
  {
    "industryName": "Retail (REITs)",
    "numberOfFirms": 26,
    "beta": 0.62,
    "deRatio": 56.42,
    "effectiveTaxRate": 1.6,
    "unleveredBeta": 0.44,
    "cashToFirmValue": 1.48,
    "unleveredBetaCashCorrected": 0.44,
    "hiloRisk": 0.2005,
    "stdDevEquity": 18.77,
    "stdDevOperatingIncome": 16.63
  },
  {
    "industryName": "Retail (Special Lines)",
    "numberOfFirms": 94,
    "beta": 1.09,
    "deRatio": 19.76,
    "effectiveTaxRate": 10.07,
    "unleveredBeta": 0.95,
    "cashToFirmValue": 5.3,
    "unleveredBetaCashCorrected": 1,
    "hiloRisk": 0.5309,
    "stdDevEquity": 53.25,
    "stdDevOperatingIncome": 25.77
  },
  {
    "industryName": "Rubber& Tires",
    "numberOfFirms": 3,
    "beta": 0.53,
    "deRatio": 358.47,
    "effectiveTaxRate": 0,
    "unleveredBeta": 0.14,
    "cashToFirmValue": 7.01,
    "unleveredBetaCashCorrected": 0.15,
    "hiloRisk": 0.3628,
    "stdDevEquity": 50.77,
    "stdDevOperatingIncome": 61.96
  },
  {
    "industryName": "Semiconductor",
    "numberOfFirms": 66,
    "beta": 1.52,
    "deRatio": 2.59,
    "effectiveTaxRate": 5.11,
    "unleveredBeta": 1.49,
    "cashToFirmValue": 1.02,
    "unleveredBetaCashCorrected": 1.5,
    "hiloRisk": 0.544,
    "stdDevEquity": 55.83,
    "stdDevOperatingIncome": 41.94
  },
  {
    "industryName": "Semiconductor Equip",
    "numberOfFirms": 31,
    "beta": 1.4,
    "deRatio": 4.86,
    "effectiveTaxRate": 9.96,
    "unleveredBeta": 1.35,
    "cashToFirmValue": 3.13,
    "unleveredBetaCashCorrected": 1.39,
    "hiloRisk": 0.476,
    "stdDevEquity": 50.08,
    "stdDevOperatingIncome": 49.58
  },
  {
    "industryName": "Shipbuilding & Marine",
    "numberOfFirms": 8,
    "beta": 0.75,
    "deRatio": 22.55,
    "effectiveTaxRate": 5.26,
    "unleveredBeta": 0.64,
    "cashToFirmValue": 2.54,
    "unleveredBetaCashCorrected": 0.66,
    "hiloRisk": 0.5291,
    "stdDevEquity": 50.09,
    "stdDevOperatingIncome": 70.6
  },
  {
    "industryName": "Shoe",
    "numberOfFirms": 11,
    "beta": 1.02,
    "deRatio": 11.94,
    "effectiveTaxRate": 11.86,
    "unleveredBeta": 0.93,
    "cashToFirmValue": 6.65,
    "unleveredBetaCashCorrected": 1,
    "hiloRisk": 0.4536,
    "stdDevEquity": 50.08,
    "stdDevOperatingIncome": 26.37
  },
  {
    "industryName": "Software (Entertainment)",
    "numberOfFirms": 77,
    "beta": 1.03,
    "deRatio": 2.04,
    "effectiveTaxRate": 5.29,
    "unleveredBeta": 1.01,
    "cashToFirmValue": 0.78,
    "unleveredBetaCashCorrected": 1.02,
    "hiloRisk": 0.6091,
    "stdDevEquity": 57.06,
    "stdDevOperatingIncome": 59.01
  },
  {
    "industryName": "Software (Internet)",
    "numberOfFirms": 29,
    "beta": 1.69,
    "deRatio": 12.3,
    "effectiveTaxRate": 3.05,
    "unleveredBeta": 1.55,
    "cashToFirmValue": 2.8,
    "unleveredBetaCashCorrected": 1.59,
    "hiloRisk": 0.5618,
    "stdDevEquity": 52.61,
    "stdDevOperatingIncome": 234.02
  },
  {
    "industryName": "Software (System & Application)",
    "numberOfFirms": 309,
    "beta": 1.28,
    "deRatio": 5.58,
    "effectiveTaxRate": 5.51,
    "unleveredBeta": 1.23,
    "cashToFirmValue": 1.83,
    "unleveredBetaCashCorrected": 1.25,
    "hiloRisk": 0.5741,
    "stdDevEquity": 56.79,
    "stdDevOperatingIncome": 48.63
  },
  {
    "industryName": "Steel",
    "numberOfFirms": 19,
    "beta": 1.06,
    "deRatio": 23.51,
    "effectiveTaxRate": 9.28,
    "unleveredBeta": 0.9,
    "cashToFirmValue": 4.38,
    "unleveredBetaCashCorrected": 0.94,
    "hiloRisk": 0.3648,
    "stdDevEquity": 38.51,
    "stdDevOperatingIncome": 85.3
  },
  {
    "industryName": "Telecom (Wireless)",
    "numberOfFirms": 12,
    "beta": 0.54,
    "deRatio": 51.95,
    "effectiveTaxRate": 4.02,
    "unleveredBeta": 0.39,
    "cashToFirmValue": 1.32,
    "unleveredBetaCashCorrected": 0.39,
    "hiloRisk": 0.503,
    "stdDevEquity": 40.18,
    "stdDevOperatingIncome": 58.11
  },
  {
    "industryName": "Telecom. Equipment",
    "numberOfFirms": 57,
    "beta": 0.92,
    "deRatio": 9.22,
    "effectiveTaxRate": 7.06,
    "unleveredBeta": 0.86,
    "cashToFirmValue": 2.68,
    "unleveredBetaCashCorrected": 0.89,
    "hiloRisk": 0.5619,
    "stdDevEquity": 55.26,
    "stdDevOperatingIncome": 11.3
  },
  {
    "industryName": "Telecom. Services",
    "numberOfFirms": 39,
    "beta": 0.63,
    "deRatio": 96.06,
    "effectiveTaxRate": 3.4,
    "unleveredBeta": 0.37,
    "cashToFirmValue": 4.21,
    "unleveredBetaCashCorrected": 0.38,
    "hiloRisk": 0.5335,
    "stdDevEquity": 60.29,
    "stdDevOperatingIncome": 9.46
  },
  {
    "industryName": "Tobacco",
    "numberOfFirms": 10,
    "beta": 0.79,
    "deRatio": 22.97,
    "effectiveTaxRate": 14.77,
    "unleveredBeta": 0.68,
    "cashToFirmValue": 1.84,
    "unleveredBetaCashCorrected": 0.69,
    "hiloRisk": 0.564,
    "stdDevEquity": 65.96,
    "stdDevOperatingIncome": 10.13
  },
  {
    "industryName": "Transportation",
    "numberOfFirms": 19,
    "beta": 0.86,
    "deRatio": 36.45,
    "effectiveTaxRate": 8.54,
    "unleveredBeta": 0.68,
    "cashToFirmValue": 5.09,
    "unleveredBetaCashCorrected": 0.71,
    "hiloRisk": 0.4445,
    "stdDevEquity": 38.13,
    "stdDevOperatingIncome": 54.77
  },
  {
    "industryName": "Transportation (Railroads)",
    "numberOfFirms": 4,
    "beta": 0.98,
    "deRatio": 27.79,
    "effectiveTaxRate": 16.98,
    "unleveredBeta": 0.81,
    "cashToFirmValue": 0.83,
    "unleveredBetaCashCorrected": 0.81,
    "hiloRisk": 0.2393,
    "stdDevEquity": 23.9,
    "stdDevOperatingIncome": 13.37
  },
  {
    "industryName": "Trucking",
    "numberOfFirms": 26,
    "beta": 1.01,
    "deRatio": 25.23,
    "effectiveTaxRate": 12.6,
    "unleveredBeta": 0.85,
    "cashToFirmValue": 2.12,
    "unleveredBetaCashCorrected": 0.87,
    "hiloRisk": 0.4329,
    "stdDevEquity": 35.29,
    "stdDevOperatingIncome": 33.03
  },
  {
    "industryName": "Utility (General)",
    "numberOfFirms": 14,
    "beta": 0.24,
    "deRatio": 81.48,
    "effectiveTaxRate": 12.77,
    "unleveredBeta": 0.15,
    "cashToFirmValue": 0.33,
    "unleveredBetaCashCorrected": 0.15,
    "hiloRisk": 0.1301,
    "stdDevEquity": 14.96,
    "stdDevOperatingIncome": 13.12
  },
  {
    "industryName": "Utility (Water)",
    "numberOfFirms": 14,
    "beta": 0.41,
    "deRatio": 62.36,
    "effectiveTaxRate": 11.19,
    "unleveredBeta": 0.28,
    "cashToFirmValue": 0.46,
    "unleveredBetaCashCorrected": 0.28,
    "hiloRisk": 0.2491,
    "stdDevEquity": 48.07,
    "stdDevOperatingIncome": 21.22
  },
  {
    "industryName": "Total Market",
    "numberOfFirms": 5994,
    "beta": 0.91,
    "deRatio": 35.17,
    "effectiveTaxRate": 8.3,
    "unleveredBeta": 0.72,
    "cashToFirmValue": 4.5,
    "unleveredBetaCashCorrected": 0.76,
    "hiloRisk": 0.4807,
    "stdDevEquity": 48.07,
    "stdDevOperatingIncome": 27.75
  },
  {
    "industryName": "Total Market (without financial)",
    "numberOfFirms": 4822,
    "beta": 0.99,
    "deRatio": 17.29,
    "effectiveTaxRate": 7.1,
    "unleveredBeta": 0.88,
    "cashToFirmValue": 2.6,
    "unleveredBetaCashCorrected": 0.9,
    "hiloRisk": 0.5345,
    "stdDevEquity": 52.76,
    "stdDevOperatingIncome": 28.15
  }
];

export const DAMODARAN_INDUSTRY_MAP: Record<string, DamodaranIndustryRecord> = {};
for (const item of DAMODARAN_GLOBAL_BETAS) {
  DAMODARAN_INDUSTRY_MAP[item.industryName.toLowerCase()] = item;
}

/**
 * BIST Sektörünü, Ticker'ını ve Faaliyet Alanını Damodaran Küresel Sektör Tablosuna Eşler.
 */
export function lookupDamodaranIndustry(
  sector: string,
  ticker?: string,
  companySectorName?: string
): DamodaranIndustryRecord {
  const t = String(ticker || '').toUpperCase();
  const secName = String(companySectorName || '').toLowerCase();
  const s = String(sector || '').toUpperCase();

  // 1. Havacılık ve Ulaştırma
  if (['THYAO', 'PGSUS'].includes(t) || s === 'AVIATION') {
    return DAMODARAN_INDUSTRY_MAP['air transport'] || DAMODARAN_GLOBAL_BETAS[2];
  }
  if (['TAVHL', 'CLEBI'].includes(t)) {
    return DAMODARAN_INDUSTRY_MAP['transportation'] || DAMODARAN_INDUSTRY_MAP['air transport'];
  }

  // 2. Savunma Sanayi & Havacılık Teknolojisi
  if (['ASELS', 'SDTTR'].includes(t) || /savunma/i.test(secName)) {
    return DAMODARAN_INDUSTRY_MAP['aerospace/defense'] || DAMODARAN_GLOBAL_BETAS[1];
  }

  // 3. Otomotiv & Yan Sanayi
  if (['FROTO', 'TOASO', 'TTRAK', 'DOAS', 'TMSN'].includes(t) || /otomotiv/i.test(secName)) {
    return DAMODARAN_INDUSTRY_MAP['auto & truck'] || DAMODARAN_GLOBAL_BETAS[4];
  }
  if (['OTKAR', 'BRISA', 'GOODY'].includes(t) || /yedek parça|lastik/i.test(secName)) {
    return DAMODARAN_INDUSTRY_MAP['auto parts'] || DAMODARAN_GLOBAL_BETAS[5];
  }

  // 4. Bankacılık
  if (['GARAN', 'AKBNK', 'ISCTR', 'YKBNK', 'VAKBN', 'HALKB'].includes(t) || s === 'BANKING') {
    return DAMODARAN_INDUSTRY_MAP['bank (money center)'] || DAMODARAN_INDUSTRY_MAP['banks (regional)'];
  }

  // 5. Sigortacılık
  if (['AGESA', 'ANHYT'].includes(t)) {
    return DAMODARAN_INDUSTRY_MAP['insurance (life)'] || DAMODARAN_GLOBAL_BETAS[47];
  }
  if (['TURSG', 'ANSGR', 'AKGRT', 'RAYSG'].includes(t) || s === 'INSURANCE') {
    return DAMODARAN_INDUSTRY_MAP['insurance (general)'] || DAMODARAN_GLOBAL_BETAS[46];
  }

  // 6. Holding & Çeşitlendirilmiş Şirketler
  if (['SAHOL', 'KCHOL', 'SISE', 'AGHOL', 'DOHOL', 'ALARK'].includes(t) || s === 'HOLDING') {
    return DAMODARAN_INDUSTRY_MAP['diversified'] || DAMODARAN_GLOBAL_BETAS[22];
  }

  // 7. GYO (Gayrimenkul Yatırım Ortaklıkları)
  if (['EKGYO', 'TRGYO', 'SNGYO', 'ISGYO', 'TORUN'].includes(t) || s === 'REIT' || t.endsWith('GYO')) {
    return DAMODARAN_INDUSTRY_MAP['r.e.i.t.'] || DAMODARAN_GLOBAL_BETAS[63];
  }

  // 8. Demir Çelik & Madencilik
  if (['EREGL', 'KRDMD', 'ISDMR'].includes(t) || /demir|çelik/i.test(secName)) {
    return DAMODARAN_INDUSTRY_MAP['steel'] || DAMODARAN_GLOBAL_BETAS[83];
  }
  if (['KOZAL', 'KOZAA', 'IPEKE'].includes(t) || /maden|altın/i.test(secName)) {
    return DAMODARAN_INDUSTRY_MAP['metals & mining'] || DAMODARAN_GLOBAL_BETAS[51];
  }

  // 9. Perakende & Tüketim
  if (['BIMAS', 'MGROS', 'SOKM', 'BIZIM', 'CRFSA'].includes(t)) {
    return DAMODARAN_INDUSTRY_MAP['retail (grocery and food)'] || DAMODARAN_GLOBAL_BETAS[72];
  }
  if (s === 'RETAIL') {
    return DAMODARAN_INDUSTRY_MAP['retail (general)'] || DAMODARAN_GLOBAL_BETAS[71];
  }

  // 10. Gıda ve İçecek İmalatı
  if (['ULKER', 'CCOLA', 'AEFES', 'TATGD', 'PNSUT'].includes(t) || /gıda|içecek/i.test(secName)) {
    return DAMODARAN_INDUSTRY_MAP['food processing'] || DAMODARAN_GLOBAL_BETAS[34];
  }

  // 11. Sağlık & İlaç
  if (['MPARK', 'LKMNH', 'TNZTP', 'MEDTR'].includes(t) || s === 'HEALTHCARE' || /hastane|sağlık/i.test(secName)) {
    return DAMODARAN_INDUSTRY_MAP['hospitals/healthcare facilities'] || DAMODARAN_GLOBAL_BETAS[42];
  }
  if (['GENIL', 'SELEC', 'TRILC', 'DEVA'].includes(t) || /ilaç|ecza/i.test(secName)) {
    return DAMODARAN_INDUSTRY_MAP['drugs (pharmaceutical)'] || DAMODARAN_GLOBAL_BETAS[24];
  }

  // 12. Telekomünikasyon
  if (['TCELL', 'TTKOM'].includes(t) || /telekom/i.test(secName)) {
    return DAMODARAN_INDUSTRY_MAP['telecom. services'] || DAMODARAN_GLOBAL_BETAS[86];
  }

  // 13. Enerji & Elektrik Üretimi
  if (['ENJSA', 'AKSEN', 'AYGAZ', 'GWIND', 'CWENE', 'ASTOR'].includes(t) || s === 'UTILITIES_TELCO' || /elektrik|enerji/i.test(secName)) {
    return DAMODARAN_INDUSTRY_MAP['power'] || DAMODARAN_GLOBAL_BETAS[59];
  }

  // 14. Yazılım & Teknoloji
  if (['MIATK', 'LOGO', 'FONET', 'ARDYZ', 'VBTYZ'].includes(t) || s === 'TECH' || /yazılım|bilişim/i.test(secName)) {
    return DAMODARAN_INDUSTRY_MAP['software (system & application)'] || DAMODARAN_GLOBAL_BETAS[82];
  }

  // 15. Kimya ve Petrol
  if (['TUPRS', 'PETKM'].includes(t) || /petrol|rafineri/i.test(secName)) {
    return DAMODARAN_INDUSTRY_MAP['oil/gas (integrated)'] || DAMODARAN_GLOBAL_BETAS[53];
  }
  if (['SASA', 'HEKTS', 'GUBRF', 'BAGFS'].includes(t) || /kimya|gübre/i.test(secName)) {
    return DAMODARAN_INDUSTRY_MAP['chemical (specialty)'] || DAMODARAN_GLOBAL_BETAS[17];
  }

  // Genel Piyasa / Varsayılan
  return DAMODARAN_INDUSTRY_MAP['total market (without financial)'] || DAMODARAN_GLOBAL_BETAS[DAMODARAN_GLOBAL_BETAS.length - 1];
}

/**
 * Kaldıraçsız Beta (Unlevered Beta) Değerini Getirir.
 * Nakit düzeltmeli (Cash-corrected) opsiyonu kurumsal finansta varsayılandır.
 */
export function getDamodaranUnleveredBeta(
  sector: string,
  ticker?: string,
  companySectorName?: string,
  useCashCorrected = true
): number {
  const rec = lookupDamodaranIndustry(sector, ticker, companySectorName);
  if (!rec) return 0.88;
  return useCashCorrected ? (rec.unleveredBetaCashCorrected || rec.unleveredBeta) : rec.unleveredBeta;
}
