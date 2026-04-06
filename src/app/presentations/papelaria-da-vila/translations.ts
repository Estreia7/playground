export type Lang = "pt" | "en" | "es";

export const translations: Record<Lang, {
  confidential: string;
  year: string;
  slideOf: string;
  cover: {
    label: string;
    title: string;
    subtitle: string;
    description: string;
    cta: string;
    badge1: string;
    badge2: string;
  };
  about: {
    label: string;
    title: string;
    description: string;
    points: string[];
  };
  services: {
    label: string;
    title: string;
    description: string;
    items: { title: string; description: string; icon: string }[];
  };
  why: {
    label: string;
    title: string;
    description: string;
    cards: { title: string; description: string; stat: string }[];
  };
  contact: {
    label: string;
    title: string;
    description: string;
    cta: string;
    email: string;
    details: string;
  };
}> = {
  pt: {
    confidential: "Confidencial",
    year: "2026",
    slideOf: "de",
    cover: {
      label: "Apresentação de Serviços",
      title: "As Suas Regras. Os Seus Sistemas.",
      subtitle: "Papelaria da Vila × Aekios",
      description:
        "Soluções de software à medida para transformar a operação da Papelaria da Vila — da gestão de stock ao e-commerce B2B, tudo construído em torno do seu negócio.",
      cta: "Vamos Conversar",
      badge1: "50+ Projetos",
      badge2: "Custom · AI-Powered",
    },
    about: {
      label: "Sobre Nós",
      title: "Quem é a Aekios?",
      description:
        "Somos uma empresa de desenvolvimento de software especializada em criar plataformas à medida para PMEs. Em vez de ferramentas genéricas que forçam adaptação, construímos sistemas que se adaptam ao seu negócio.",
      points: [
        "Plataformas personalizadas que o negócio detém a 100%",
        "Integração de inteligência artificial em processos existentes",
        "Ecossistemas modulares que crescem consigo",
        "Suporte contínuo e manutenção dedicada",
      ],
    },
    services: {
      label: "Serviços",
      title: "O Que Podemos Fazer por Si",
      description:
        "Cada solução é desenhada especificamente para os desafios e oportunidades da Papelaria da Vila.",
      items: [
        {
          title: "Plataforma E-Commerce B2B",
          description:
            "Portal de encomendas para clientes empresariais com catálogo digital, gestão de preços por cliente e integração com o seu ERP.",
          icon: "store",
        },
        {
          title: "Gestão de Stock Inteligente",
          description:
            "Sistema com previsão de procura baseada em IA, alertas automáticos de reposição e dashboards em tempo real.",
          icon: "chart",
        },
        {
          title: "Presença Digital & SEO",
          description:
            "Website moderno, otimizado para motores de busca, com integração ao catálogo online e sistema de contacto automatizado.",
          icon: "globe",
        },
        {
          title: "Automação de Processos",
          description:
            "Digitalização de workflows internos — desde faturação até logística de entregas — para reduzir erros e poupar tempo.",
          icon: "automation",
        },
      ],
    },
    why: {
      label: "Porquê Nós",
      title: "Porque Escolher a Aekios",
      description:
        "Não vendemos software genérico. Construímos ferramentas que resolvem os seus problemas reais.",
      cards: [
        {
          title: "100% À Medida",
          description:
            "Cada linha de código é escrita para o seu negócio. Sem licenças mensais de terceiros.",
          stat: "100%",
        },
        {
          title: "Entrega Rápida",
          description:
            "MVP funcional em semanas, não meses. Iteramos consigo até à solução perfeita.",
          stat: "4-6 sem",
        },
        {
          title: "IA Integrada",
          description:
            "Aproveitamos inteligência artificial para automatizar tarefas repetitivas e gerar insights.",
          stat: "AI",
        },
        {
          title: "Suporte Dedicado",
          description:
            "Equipa acessível com manutenção contínua. O seu negócio nunca pára.",
          stat: "24/7",
        },
      ],
    },
    contact: {
      label: "Contacto",
      title: "Vamos Começar?",
      description:
        "Estamos prontos para analisar o seu negócio e desenhar a solução ideal. Sem compromisso — o primeiro passo é uma conversa.",
      cta: "Agendar Reunião",
      email: "hello@aekios.com",
      details: "aekios.com",
    },
  },
  en: {
    confidential: "Confidential",
    year: "2026",
    slideOf: "of",
    cover: {
      label: "Services Overview",
      title: "Your Rules. Your Systems.",
      subtitle: "Papelaria da Vila × Aekios",
      description:
        "Tailored software solutions to transform Papelaria da Vila's operations — from stock management to B2B e-commerce, built around your business.",
      cta: "Let's Talk",
      badge1: "50+ Projects",
      badge2: "Custom · AI-Powered",
    },
    about: {
      label: "About Us",
      title: "Who is Aekios?",
      description:
        "We are a software development company specialized in building tailored platforms for SMEs. Instead of generic tools that force adaptation, we build systems that adapt to your business.",
      points: [
        "Custom platforms 100% owned by your business",
        "AI integration into existing processes",
        "Modular ecosystems that grow with you",
        "Ongoing support and dedicated maintenance",
      ],
    },
    services: {
      label: "Services",
      title: "What We Can Do For You",
      description:
        "Every solution is designed specifically for Papelaria da Vila's challenges and opportunities.",
      items: [
        {
          title: "B2B E-Commerce Platform",
          description:
            "Order portal for business clients with digital catalog, per-client pricing, and ERP integration.",
          icon: "store",
        },
        {
          title: "Smart Stock Management",
          description:
            "AI-powered demand forecasting, automatic replenishment alerts, and real-time dashboards.",
          icon: "chart",
        },
        {
          title: "Digital Presence & SEO",
          description:
            "Modern website, search-engine optimized, with catalog integration and automated contact system.",
          icon: "globe",
        },
        {
          title: "Process Automation",
          description:
            "Digitize internal workflows — from invoicing to delivery logistics — to reduce errors and save time.",
          icon: "automation",
        },
      ],
    },
    why: {
      label: "Why Us",
      title: "Why Choose Aekios",
      description:
        "We don't sell generic software. We build tools that solve your real problems.",
      cards: [
        {
          title: "100% Custom",
          description:
            "Every line of code is written for your business. No third-party monthly licenses.",
          stat: "100%",
        },
        {
          title: "Fast Delivery",
          description:
            "Functional MVP in weeks, not months. We iterate with you until perfection.",
          stat: "4-6 wk",
        },
        {
          title: "AI Integrated",
          description:
            "We leverage artificial intelligence to automate repetitive tasks and generate insights.",
          stat: "AI",
        },
        {
          title: "Dedicated Support",
          description:
            "Accessible team with ongoing maintenance. Your business never stops.",
          stat: "24/7",
        },
      ],
    },
    contact: {
      label: "Contact",
      title: "Ready to Start?",
      description:
        "We're ready to analyze your business and design the ideal solution. No commitment — the first step is a conversation.",
      cta: "Schedule Meeting",
      email: "hello@aekios.com",
      details: "aekios.com",
    },
  },
  es: {
    confidential: "Confidencial",
    year: "2026",
    slideOf: "de",
    cover: {
      label: "Presentación de Servicios",
      title: "Tus Reglas. Tus Sistemas.",
      subtitle: "Papelaria da Vila × Aekios",
      description:
        "Soluciones de software a medida para transformar las operaciones de Papelaria da Vila — desde la gestión de stock hasta el e-commerce B2B, todo construido alrededor de tu negocio.",
      cta: "Hablemos",
      badge1: "50+ Proyectos",
      badge2: "Custom · AI-Powered",
    },
    about: {
      label: "Sobre Nosotros",
      title: "¿Quién es Aekios?",
      description:
        "Somos una empresa de desarrollo de software especializada en crear plataformas a medida para PYMEs. En lugar de herramientas genéricas que fuerzan la adaptación, construimos sistemas que se adaptan a tu negocio.",
      points: [
        "Plataformas personalizadas 100% propiedad del negocio",
        "Integración de inteligencia artificial en procesos existentes",
        "Ecosistemas modulares que crecen contigo",
        "Soporte continuo y mantenimiento dedicado",
      ],
    },
    services: {
      label: "Servicios",
      title: "Lo Que Podemos Hacer por Ti",
      description:
        "Cada solución está diseñada específicamente para los desafíos y oportunidades de Papelaria da Vila.",
      items: [
        {
          title: "Plataforma E-Commerce B2B",
          description:
            "Portal de pedidos para clientes empresariales con catálogo digital, gestión de precios por cliente e integración con tu ERP.",
          icon: "store",
        },
        {
          title: "Gestión de Stock Inteligente",
          description:
            "Sistema con previsión de demanda basada en IA, alertas automáticas de reposición y dashboards en tiempo real.",
          icon: "chart",
        },
        {
          title: "Presencia Digital & SEO",
          description:
            "Sitio web moderno, optimizado para motores de búsqueda, con integración al catálogo online y sistema de contacto automatizado.",
          icon: "globe",
        },
        {
          title: "Automatización de Procesos",
          description:
            "Digitalización de workflows internos — desde facturación hasta logística de entregas — para reducir errores y ahorrar tiempo.",
          icon: "automation",
        },
      ],
    },
    why: {
      label: "Por Qué Nosotros",
      title: "Por Qué Elegir Aekios",
      description:
        "No vendemos software genérico. Construimos herramientas que resuelven tus problemas reales.",
      cards: [
        {
          title: "100% A Medida",
          description:
            "Cada línea de código está escrita para tu negocio. Sin licencias mensuales de terceros.",
          stat: "100%",
        },
        {
          title: "Entrega Rápida",
          description:
            "MVP funcional en semanas, no meses. Iteramos contigo hasta la solución perfecta.",
          stat: "4-6 sem",
        },
        {
          title: "IA Integrada",
          description:
            "Aprovechamos la inteligencia artificial para automatizar tareas repetitivas y generar insights.",
          stat: "AI",
        },
        {
          title: "Soporte Dedicado",
          description:
            "Equipo accesible con mantenimiento continuo. Tu negocio nunca para.",
          stat: "24/7",
        },
      ],
    },
    contact: {
      label: "Contacto",
      title: "¿Listos para Empezar?",
      description:
        "Estamos listos para analizar tu negocio y diseñar la solución ideal. Sin compromiso — el primer paso es una conversación.",
      cta: "Agendar Reunión",
      email: "hello@aekios.com",
      details: "aekios.com",
    },
  },
};
