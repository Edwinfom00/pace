export const TRANSACTION_VISUAL_CATEGORIES = ["AGRICULTURE","COMMUNITY","DELIVERY","DIGITAL","EDUCATION","ELECTRONICS","FINANCE","FOOD","GENERIC","HEALTH","HOME","INCOME","PETS","PROFESSIONAL","SHOPPING","TRANSPORT","TRAVEL","UTILITIES"] as const;

export type TransactionVisualCategory = (typeof TRANSACTION_VISUAL_CATEGORIES)[number];

export const TRANSACTION_ICON_KEYS = ["accounting","agriculture","airtime","allowance","appliances","bakery","bank-fee","bar","beauty","bicycle","books","books-digital","bus","business-income","business-services","butcher","cable-broadband","cafe","camera","car-rental","car-repair","car-wash","cash-deposit","cash-withdrawal","cashback","charity","childcare","cleaning","clothing","cloud","community-support","computer","consulting","convenience-store","cooking-gas","cooperative-savings","cosmetics","course","credit-card","crypto","customs","data-bundle","delivery","dentist","dividend","doctor","domain","electricity","electricity-prepaid","electronics","emergency-care","family-support","farm-input","fast-food","ferry","fishing","fitness","flight","food-delivery","freelance-income","fuel","funeral","furniture","gaming","gas","generic-expense","generic-income","generic-refund","generic-transaction","generic-transfer","gift","gift-income","government-fee","grocery-store","haircut","health-insurance","health-supplements","home-improvement","home-maintenance","home-security","hospital","hosting","hotel","household-goods","import-duty","insurance","interest","internet","investment-contribution","investment-income","jewelry","laboratory","legal","livestock","loan","loan-payment","logistics","luggage","market","mental-wellness","metro","microfinance","mobile-money","mobile-phone","mortgage","motorbike","music","news","office-supplies","online-learning","online-shopping","optician","parking","passport","pet-food","pets","pharmacy","phone","postal-service","produce","property-tax","public-transport","refund","religious-giving","remittance","rent","restaurant","ride-hailing","salary","savings-deposit","school","school-fees","security","seed-and-crop","shipping","shoes","software","sports-equipment","streaming","student-loan","subscription","supermarket","tax","taxi","television","toll","tourism","toys","train","transfer","travel","tutoring","university","vehicle-insurance","vet","visa","vision-care","wallet","waste-collection","water","wedding"] as const;

export const ADDITIONAL_TRANSACTION_ICON_KEYS = ["seafood","street-food","food-court","meal-kit","catering","airport-transfer","parking-fee","vehicle-registration","roadside-assistance","scooter","plumbing","roofing","moving-service","utilities-bundle","home-decor","physiotherapy","maternal-care","dental-care","medical-devices","clinic","exam-fee","uniforms","stationery","language-course","education-savings","department-store","discount-store","florist","craft-supplies","homewares","app-store","mobile-app","cyber-security","internet-cafe","digital-wallet","forex","currency-exchange","payment-processor","cash-on-delivery","merchant-services","transit-pass","baggage-fee","travel-insurance","hostel","tour-guide","cultural-event","elder-care","mutual-aid","birthday","celebration"] as const;

export type TransactionIconKey =
  | (typeof TRANSACTION_ICON_KEYS)[number]
  | (typeof ADDITIONAL_TRANSACTION_ICON_KEYS)[number];

export interface TransactionIconDefinition {
  readonly key: TransactionIconKey;
  readonly path: string;
  readonly category: TransactionVisualCategory;
  readonly label: string;
  readonly aliases: readonly string[];
  readonly keywords: readonly string[];
}

export interface TransactionIconResolution {
  readonly iconKey: TransactionIconKey;
  readonly iconPath: string;
  readonly category: TransactionVisualCategory;
  readonly source: "explicit" | "merchant" | "category-key" | "category-name" | "kind" | "fallback";
}
