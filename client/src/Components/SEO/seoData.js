/**
 * SEO Configuration for TenBet Live
 * Contains optimized metadata for all pages
 * Keywords optimized for Bangladesh betting market
 */

const BASE_URL = "https://TenBet.live";

export const seoData = {
  home: {
    title: "TenBet Live | Best Online Betting & Casino in Bangladesh",
    description:
      "Join TenBet Live for the ultimate online betting experience. Live sports betting, cricket, football, casino games, slots. Fast deposits & withdrawals. Sign up now!",
    keywords:
      "online betting bangladesh, TenBet live, live betting, sports betting bd, casino games, cricket betting, football betting, trusted betting site",
    canonical: BASE_URL,
    ogImage: `${BASE_URL}/og-home.jpg`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Organization",
      name: "TenBet Live",
      url: BASE_URL,
      logo: `${BASE_URL}/logo.png`,
      description: "Premier online betting and casino platform in Bangladesh",
      sameAs: [
        "https://facebook.com/TenBetlive",
        "https://twitter.com/TenBetlive",
        "https://instagram.com/TenBetlive",
      ],
    },
  },

  liveBetting: {
    title: "Live Betting | Real-Time Sports Betting at TenBet Live",
    description:
      "Experience thrilling live betting on cricket, football, tennis & more. Real-time odds, instant bets, live streaming. Bet live on TenBet with the best odds in Bangladesh.",
    keywords:
      "live betting bangladesh, live sports betting, real time betting, in-play betting, live cricket betting, live football betting, TenBet live",
    canonical: `${BASE_URL}/live-betting`,
    ogImage: `${BASE_URL}/og-live-betting.jpg`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "SportsOrganization",
      name: "TenBet Live Betting",
      url: `${BASE_URL}/live-betting`,
      description:
        "Live sports betting with real-time odds and instant payouts",
    },
  },

  sports: {
    title: "Sports Betting | Cricket, Football & More | TenBet Live",
    description:
      "Bet on cricket, football, tennis, basketball & more sports. Best odds, live updates, secure betting. Join thousands of sports bettors at TenBet Live today!",
    keywords:
      "sports betting bangladesh, cricket betting, football betting, tennis betting, basketball betting, sports odds, TenBet sports",
    canonical: `${BASE_URL}/sports`,
    ogImage: `${BASE_URL}/og-sports.jpg`,
  },

  casino: {
    title: "Online Casino | Slots, Poker, Roulette | TenBet Live Casino",
    description:
      "Play premium casino games at TenBet Live. 1000+ slots, live dealer games, blackjack, roulette, poker. Big jackpots, instant play, secure gaming. Join now!",
    keywords:
      "online casino bangladesh, casino games, slots online, live casino, blackjack, roulette, poker online, TenBet casino",
    canonical: `${BASE_URL}/casino`,
    ogImage: `${BASE_URL}/og-casino.jpg`,
    structuredData: {
      "@context": "https://schema.org",
      "@type": "Casino",
      name: "TenBet Live Casino",
      url: `${BASE_URL}/casino`,
      description: "Premium online casino with 1000+ games and live dealers",
    },
  },

  register: {
    title: "Sign Up | Create Account & Get Welcome Bonus | TenBet Live",
    description:
      "Register at TenBet Live in 2 minutes. Get 100% welcome bonus on first deposit. Easy signup, fast verification, instant betting access. Join now!",
    keywords:
      "register TenBet, sign up betting account, betting registration bangladesh, welcome bonus, new account betting",
    canonical: `${BASE_URL}/register`,
    ogImage: `${BASE_URL}/og-register.jpg`,
    noindex: false, // Allow indexing for signup page to attract new users
  },

  login: {
    title: "Login | Access Your TenBet Live Account",
    description:
      "Login to your TenBet Live account. Secure access to betting, casino games, deposits, withdrawals. Forgot password? Reset instantly. Login now!",
    keywords:
      "login TenBet, betting account login, secure login, member access",
    canonical: `${BASE_URL}/login`,
    ogImage: `${BASE_URL}/og-login.jpg`,
    noindex: true, // Prevent indexing of login page
  },

  promotions: {
    title: "Promotions & Bonuses | Daily Offers | TenBet Live",
    description:
      "Grab amazing bonuses at TenBet Live! Welcome bonus, deposit bonus, cashback, free bets. Daily promotions for sports & casino. Check today's offers!",
    keywords:
      "betting promotions, welcome bonus, deposit bonus, cashback offers, free bets, betting bonuses bangladesh, TenBet promotions",
    canonical: `${BASE_URL}/promotions`,
    ogImage: `${BASE_URL}/og-promotions.jpg`,
  },

  deposit: {
    title: "Deposit | Fast & Secure Payment Methods | TenBet Live",
    description:
      "Deposit easily with bKash, Nagad, Rocket, cards. Instant deposits, minimum ৳200, secure transactions. Multiple payment methods available. Deposit now!",
    keywords:
      "deposit TenBet, bkash deposit, nagad deposit, rocket deposit, betting payment methods bangladesh",
    canonical: `${BASE_URL}/deposit`,
    ogImage: `${BASE_URL}/og-deposit.jpg`,
    noindex: false,
  },

  about: {
    title: "About Us | Leading Betting Platform | TenBet Live",
    description:
      "Learn about TenBet Live - Bangladesh's trusted online betting platform. Licensed, secure, fair gaming. Our mission: provide the best betting experience.",
    keywords:
      "about TenBet, betting platform bangladesh, trusted betting site, licensed casino, fair gaming",
    canonical: `${BASE_URL}/about`,
    ogImage: `${BASE_URL}/og-about.jpg`,
  },

  contact: {
    title: "Contact Us | 24/7 Customer Support | TenBet Live",
    description:
      "24/7 customer support at TenBet Live. Live chat, email, phone support. Fast response, expert help. Contact us anytime for betting assistance.",
    keywords:
      "contact TenBet, customer support, betting help, live chat support, 24/7 support",
    canonical: `${BASE_URL}/contact`,
    ogImage: `${BASE_URL}/og-contact.jpg`,
  },

  termsConditions: {
    title: "Terms & Conditions | TenBet Live",
    description:
      "Read the terms and conditions of TenBet Live. Rules, regulations, betting terms, responsible gaming policies. Updated 2026.",
    keywords:
      "terms and conditions, betting rules, user agreement, TenBet terms",
    canonical: `${BASE_URL}/terms`,
    ogImage: `${BASE_URL}/og-terms.jpg`,
    noindex: true,
  },

  privacyPolicy: {
    title: "Privacy Policy | Data Protection | TenBet Live",
    description:
      "Your privacy matters. Read our privacy policy to understand how we protect your data at TenBet Live. GDPR compliant, secure data handling.",
    keywords: "privacy policy, data protection, secure betting, user privacy",
    canonical: `${BASE_URL}/privacy`,
    ogImage: `${BASE_URL}/og-privacy.jpg`,
    noindex: true,
  },

  responsibleGaming: {
    title: "Responsible Gaming | Play Safe | TenBet Live",
    description:
      "Bet responsibly at TenBet Live. Self-exclusion tools, deposit limits, time limits. We promote safe and responsible gambling. Get help if needed.",
    keywords:
      "responsible gaming, safe betting, gambling help, self exclusion, betting limits",
    canonical: `${BASE_URL}/responsible-gaming`,
    ogImage: `${BASE_URL}/og-responsible.jpg`,
  },
};

// Helper function to get SEO data for a page
export const getSEO = (page) => {
  return seoData[page] || seoData.home;
};

// Default fallback SEO
export const defaultSEO = seoData.home;
