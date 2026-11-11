// All words on the site, in English and Arabic. Keep both languages in step.
// Claims stay factual: services offered, no invented clients, projects or numbers.

export const CONTACT = {
  email: 'futurex.om@outlook.com',
  phone: '+968 9657 7780',
  whatsapp: 'https://wa.me/96896577780',
};

const en = {
  dir: 'ltr',
  meta: {
    title: 'FutureX Technical Solutions',
    description:
      'FutureX Technical Solutions, Muscat: telecom infrastructure, data centres, artificial intelligence and software applications for organisations in Oman.',
  },
  nav: { layers: 'What we do', products: 'Products', approach: 'How we work', company: 'Company', contact: 'Contact', cta: 'Talk to us', lang: 'العربية', langLabel: 'Read this site in Arabic', menu: 'Menu', close: 'Close' },
  hero: {
    title: ['Four services.', 'One standard.'],
    lead: 'Telecom infrastructure, data centres, artificial intelligence and software development. FutureX Technical Solutions offers each as a separate service, so you hire us for exactly what your project needs.',
    primary: 'Talk to our team',
    secondary: 'See our services',
  },
  layers: {
    eyebrow: 'What we do',
    title: 'Each service stands on its own.',
    intro:
      'Every service is its own line of work, with its own team and its own contract. One client needs a fibre network built, another a data centre designed, another an AI project or a new app: we take on each one separately.',
    stackLabel: 'Our four services: telecom infrastructure, data centres, artificial intelligence and applications',
    items: [
      {
        id: 'telecom',
        name: 'Telecom infrastructure',
        tagline: 'The network everything travels on.',
        services: [
          'Fibre optic network design and deployment (FTTx)',
          'Structured cabling for buildings and campuses',
          'Site surveys, testing and as-built documentation',
          'Active and passive network installation',
          'Preventive and corrective maintenance',
        ],
      },
      {
        id: 'datacentre',
        name: 'Data centres',
        tagline: 'Where your systems live.',
        services: [
          'Server room and data centre fit-out',
          'Racks, containment and cabling',
          'Power and cooling coordination (UPS, precision cooling)',
          'Monitoring, migration and relocation',
          'Capacity and growth planning',
        ],
      },
      {
        id: 'ai',
        name: 'Artificial intelligence',
        tagline: 'Turning data into decisions.',
        services: [
          'AI readiness and use-case discovery',
          'Assistants for customers and staff, in Arabic and English',
          'Reading and processing documents automatically',
          'Analytics and management dashboards',
          'Responsible use under Oman’s Personal Data Protection Law',
        ],
      },
      {
        id: 'apps',
        name: 'Applications',
        tagline: 'What people actually touch.',
        services: [
          'Mobile apps for iPhone and Android',
          'Web applications and portals',
          'Business systems: accounting, HR, operations',
          'Integration with the systems you already use',
          'Support and updates after launch',
        ],
      },
    ],
  },
  products: {
    eyebrow: 'Built by FutureX',
    title: 'We build our own products too.',
    intro: 'Our own software keeps our engineering honest: the standards we hold ourselves to are the ones we bring to client work.',
    status: 'In testing',
    items: [
      { id: 'hisab', name: 'Hisab', native: 'حساب', text: 'Accounting for small and medium businesses in Oman: invoices, bills, VAT returns, bank reconciliation, payroll and reports, in English and Arabic.' },
      { id: 'atnd', name: 'ATND', native: 'ATND', text: 'Attendance and HR for companies in Oman: attendance, leave and staff records, in Arabic and English.' },
    ],
  },
  approach: {
    eyebrow: 'How we work',
    title: 'How a project runs.',
    steps: [
      { name: 'Survey', text: 'We visit the site or sit with your team, and write down what exists, what is needed and what it will cost.' },
      { name: 'Design', text: 'Drawings, specifications and a schedule that you approve before any work starts.' },
      { name: 'Build', text: 'Installation, development and testing, with regular progress updates you can check.' },
      { name: 'Hand over and support', text: 'Documentation, training and support from our team in Muscat.' },
    ],
  },
  company: {
    eyebrow: 'The company',
    title: 'Omani-owned. Built for Oman.',
    text: 'FutureX Technical Solutions LLC was founded in Muscat in 2026 by three Omani partners. We work in Arabic and English, handle personal data under Oman’s Personal Data Protection Law, and keep support close to our clients.',
  },
  contact: {
    eyebrow: 'Contact',
    title: 'Let’s build your next project together.',
    text: 'A site to connect, a server room to fit out, a process to automate or an app to launch: send us the details and we will arrange a meeting.',
    email: 'Email',
    phone: 'Phone and WhatsApp',
    whatsapp: 'Message on WhatsApp',
    office: 'Office',
    address: ['Authority for SME Development (Riyada) Building', 'Hay Al Wizarat, Bousher', 'Muscat 133, Sultanate of Oman'],
    hours: 'Working hours',
    hoursText: 'Sunday to Thursday, 8:00 am to 5:00 pm',
    copy: 'Copy',
    copied: 'Copied',
  },
  footer: { rights: '© 2026 FutureX Technical Solutions LLC', place: 'Muscat, Sultanate of Oman', top: 'Back to top' },
};

const ar = {
  dir: 'rtl',
  meta: {
    title: 'فيوتشر اكس للحلول التقنية',
    description: 'فيوتشر اكس للحلول التقنية، مسقط: البنية التحتية للاتصالات، ومراكز البيانات، والذكاء الاصطناعي، وتطوير البرمجيات للمؤسسات في سلطنة عُمان.',
  },
  nav: { layers: 'خدماتنا', products: 'منتجاتنا', approach: 'آلية العمل', company: 'الشركة', contact: 'تواصلوا معنا', cta: 'تحدّثوا معنا', lang: 'English', langLabel: 'Read this site in English', menu: 'القائمة', close: 'إغلاق' },
  hero: {
    title: ['أربع خدمات.', 'بمعيار واحد.'],
    lead: 'البنية التحتية للاتصالات، ومراكز البيانات، والذكاء الاصطناعي، وتطوير البرمجيات. تقدّم فيوتشر اكس للحلول التقنية كلّاً منها خدمةً مستقلة، لتختاروا منها ما يحتاجه مشروعكم.',
    primary: 'تحدّثوا مع فريقنا',
    secondary: 'تعرّفوا على خدماتنا',
  },
  layers: {
    eyebrow: 'خدماتنا',
    title: 'كل خدمة مستقلة بذاتها.',
    intro: 'لكل خدمة مجالها وفريقها وعقدها الخاص. فقد يحتاج عميلٌ إلى تنفيذ شبكة ألياف ضوئية، وآخر إلى تصميم مركز بيانات، وثالث إلى مشروع ذكاء اصطناعي أو تطبيق جديد، ونتولّى كل خدمة منها على حدة.',
    stackLabel: 'خدماتنا الأربع: البنية التحتية للاتصالات، ومراكز البيانات، والذكاء الاصطناعي، والتطبيقات',
    items: [
      {
        id: 'telecom',
        name: 'البنية التحتية للاتصالات',
        tagline: 'الشبكة التي ينتقل عبرها كل شيء.',
        services: [
          'تصميم شبكات الألياف الضوئية وتنفيذها (FTTx)',
          'أنظمة الكابلات المهيكلة للمباني والمجمّعات',
          'المسح الميداني والاختبار وإعداد المخططات النهائية (As-Built)',
          'تركيب مكوّنات الشبكات النشطة والخاملة',
          'الصيانة الوقائية والتصحيحية',
        ],
      },
      {
        id: 'datacentre',
        name: 'مراكز البيانات',
        tagline: 'حيث تعمل أنظمتكم.',
        services: [
          'تجهيز غرف الخوادم ومراكز البيانات',
          'خزائن الخوادم وعزل الممرات والتمديدات',
          'تنسيق أنظمة الطاقة والتبريد، ومنها مزوّدات الطاقة غير المنقطعة (UPS) والتبريد الدقيق',
          'المراقبة، وترحيل الأنظمة ونقلها',
          'تخطيط السعة والتوسّع',
        ],
      },
      {
        id: 'ai',
        name: 'الذكاء الاصطناعي',
        tagline: 'من البيانات إلى القرار.',
        services: [
          'تقييم الجاهزية وتحديد حالات الاستخدام',
          'مساعدات ذكية للعملاء والموظفين بالعربية والإنجليزية',
          'قراءة المستندات ومعالجتها آلياً',
          'تحليل البيانات ولوحات المتابعة للإدارة',
          'استخدام مسؤول للذكاء الاصطناعي وفق قانون حماية البيانات الشخصية العُماني',
        ],
      },
      {
        id: 'apps',
        name: 'التطبيقات',
        tagline: 'ما يستخدمه الناس فعلاً.',
        services: [
          'تطبيقات الجوال لأجهزة آيفون وأندرويد',
          'تطبيقات وبوابات الويب',
          'أنظمة الأعمال: المحاسبة والموارد البشرية والعمليات',
          'الربط بالأنظمة التي تستخدمونها حالياً',
          'الدعم والتحديثات بعد الإطلاق',
        ],
      },
    ],
  },
  products: {
    eyebrow: 'من تطوير فيوتشر اكس',
    title: 'نطوّر منتجاتنا الخاصة أيضاً.',
    intro: 'برمجياتنا الخاصة تبقي معاييرنا الهندسية عالية: المعايير التي نلتزم بها في منتجاتنا هي ذاتها التي نقدّمها في مشاريع عملائنا.',
    status: 'قيد الاختبار',
    items: [
      { id: 'hisab', name: 'حساب', native: 'Hisab', text: 'تطبيق محاسبة للمنشآت الصغيرة والمتوسطة في سلطنة عُمان: الفواتير والمشتريات وإقرارات ضريبة القيمة المضافة والتسويات البنكية والرواتب والتقارير، بالعربية والإنجليزية.' },
      { id: 'atnd', name: 'ATND', native: 'ATND', text: 'تطبيق للحضور والموارد البشرية للشركات في سلطنة عُمان: الحضور والإجازات وسجلات الموظفين، بالعربية والإنجليزية.' },
    ],
  },
  approach: {
    eyebrow: 'آلية العمل',
    title: 'كيف ننفّذ مشاريعنا.',
    steps: [
      { name: 'المسح', text: 'نزور الموقع أو نلتقي بفريقكم، ونوثّق الوضع الحالي واحتياجاتكم والتكلفة المتوقعة.' },
      { name: 'التصميم', text: 'نُعدّ المخططات والمواصفات والجدول الزمني لتعتمدوها قبل بدء أي عمل.' },
      { name: 'التنفيذ', text: 'التركيب والتطوير والاختبار، مع تقارير دورية عن سير العمل.' },
      { name: 'التسليم والدعم', text: 'التوثيق والتدريب والدعم من فريقنا في مسقط.' },
    ],
  },
  company: {
    eyebrow: 'الشركة',
    title: 'شركة عُمانية، لخدمة عُمان.',
    text: 'تأسست فيوتشر اكس للحلول التقنية ش.م.م في مسقط عام ٢٠٢٦ على يد ثلاثة شركاء عُمانيين. نعمل بالعربية والإنجليزية، ونتعامل مع البيانات الشخصية وفق قانون حماية البيانات الشخصية العُماني، ونقدّم الدعم لعملائنا عن قُرب.',
  },
  contact: {
    eyebrow: 'تواصلوا معنا',
    title: 'لنبنِ مشروعكم القادم معاً.',
    text: 'موقع تريدون ربطه، أو غرفة خوادم تريدون تجهيزها، أو إجراء تريدون أتمتته، أو تطبيق تريدون إطلاقه: أرسلوا إلينا التفاصيل ونرتّب معكم اجتماعاً.',
    email: 'البريد الإلكتروني',
    phone: 'الهاتف وواتساب',
    whatsapp: 'راسلونا على واتساب',
    office: 'المكتب',
    address: ['مبنى هيئة تنمية المؤسسات الصغيرة والمتوسطة (ريادة)', 'حي الوزارات، بوشر', 'مسقط ١٣٣، سلطنة عُمان'],
    hours: 'ساعات العمل',
    hoursText: 'من الأحد إلى الخميس، من الساعة ٨ صباحاً إلى ٥ مساءً',
    copy: 'نسخ',
    copied: 'تم النسخ',
  },
  footer: { rights: '© ٢٠٢٦ فيوتشر اكس للحلول التقنية ش.م.م', place: 'مسقط، سلطنة عُمان', top: 'العودة إلى الأعلى' },
};

export const CONTENT = { en, ar };
