// A/B test rounds (docs/ml-v2-plan.md step 8, short version). Instead of waiting 3-5 days for
// real traffic, the admin sends a "round": the same six alerts to every worker in the test, in
// their own language, through the normal pipeline (classifier, personal priority, routing by
// group). Three rounds a few hours apart give both groups identical alerts to react to.
// Every message ends with a note that it is a test, so nobody acts on a job that does not exist.
// Priorities are NOT set here: the classifier decides, as for any real alert.

export interface RoundItem {
  type: 'job_alert' | 'status_update' | 'announcement';
  category: 'new_job' | 'application_update' | 'announcement';
  /** Job alerts only: applications close this many minutes after the round is sent. */
  deadlineMinutes: number | null;
  en: { title: string; message: string };
  sw: { title: string; message: string };
}

const NOTE = {
  en: ' (Test alert for the KaziForce study.)',
  sw: ' (Arifa ya majaribio ya utafiti wa KaziForce.)',
};

const job = (deadlineMinutes: number, en: [string, string], sw: [string, string]): RoundItem => ({
  type: 'job_alert',
  category: 'new_job',
  deadlineMinutes,
  en: { title: en[0], message: en[1] },
  sw: { title: sw[0], message: sw[1] },
});
const update = (en: [string, string], sw: [string, string]): RoundItem => ({
  type: 'status_update',
  category: 'application_update',
  deadlineMinutes: null,
  en: { title: en[0], message: en[1] },
  sw: { title: sw[0], message: sw[1] },
});
const news = (en: [string, string], sw: [string, string]): RoundItem => ({
  type: 'announcement',
  category: 'announcement',
  deadlineMinutes: null,
  en: { title: en[0], message: en[1] },
  sw: { title: sw[0], message: sw[1] },
});

export const ROUNDS: RoundItem[][] = [
  [
    job(
      60,
      [
        'Cleaner needed today in Kilimani',
        'An office in Kilimani needs a cleaner from 2 pm today. Applications close in 1 hour.',
      ],
      [
        'Msafishaji anahitajika leo Kilimani',
        'Ofisi moja Kilimani inahitaji msafishaji kuanzia saa nane mchana leo. Maombi yanafungwa baada ya saa 1.',
      ],
    ),
    job(
      4320,
      [
        'Painter for next week in Ruaka',
        'A family in Ruaka needs a painter for two rooms next week. Applications close in 3 days.',
      ],
      [
        'Mpaka rangi wiki ijayo Ruaka',
        'Familia moja Ruaka inahitaji mpaka rangi kwa vyumba viwili wiki ijayo. Maombi yanafungwa baada ya siku 3.',
      ],
    ),
    update(
      [
        'Your shift starts earlier',
        'The employer moved your shift tomorrow from 9 am to 7 am. Please confirm you can come.',
      ],
      [
        'Zamu yako inaanza mapema',
        'Mwajiri amebadilisha zamu yako ya kesho kutoka saa tatu asubuhi hadi saa moja asubuhi. Tafadhali thibitisha kama utafika.',
      ],
    ),
    update(
      [
        'Application seen',
        'The employer has looked at your application for the shop assistant job. You will hear back this week.',
      ],
      [
        'Ombi limeonekana',
        'Mwajiri ameangalia ombi lako la kazi ya msaidizi wa duka. Utajibiwa wiki hii.',
      ],
    ),
    news(
      [
        'New KaziForce tips',
        'We added short tips on writing a good profile. Read them when you are free.',
      ],
      [
        'Vidokezo vipya vya KaziForce',
        'Tumeongeza vidokezo vifupi vya kuandika wasifu mzuri. Visome ukiwa na nafasi.',
      ],
    ),
    news(
      ['Holiday opening hours', 'The KaziForce help desk will open at 10 am on public holidays.'],
      [
        'Saa za kazi siku za sikukuu',
        'Dawati la msaada la KaziForce litafunguliwa saa nne asubuhi siku za sikukuu.',
      ],
    ),
  ],
  [
    job(
      90,
      [
        'Loaders needed now in Industrial Area',
        'A warehouse needs 3 loaders for an evening delivery. Applications close in 90 minutes.',
      ],
      [
        'Wapakiaji wanahitajika sasa Industrial Area',
        'Ghala moja linahitaji wapakiaji 3 kwa mzigo wa jioni. Maombi yanafungwa baada ya dakika 90.',
      ],
    ),
    job(
      2880,
      [
        'Cook for a weekend event',
        'A caterer in Westlands needs a cook for Saturday. Applications close in 2 days.',
      ],
      [
        'Mpishi wa sherehe ya wikendi',
        'Mpishi anahitajika Westlands kwa Jumamosi. Maombi yanafungwa baada ya siku 2.',
      ],
    ),
    update(
      [
        'You were selected',
        'Good news: you were selected for the delivery helper job. Start time and place are in your messages.',
      ],
      [
        'Umechaguliwa',
        'Habari njema: umechaguliwa kwa kazi ya msaidizi wa usafirishaji. Saa na mahali pa kuanza viko kwenye ujumbe wako.',
      ],
    ),
    update(
      [
        'Not selected this time',
        'The employer chose another worker for the gardener job. Keep applying, more jobs are coming.',
      ],
      [
        'Hukuchaguliwa wakati huu',
        'Mwajiri amemchagua mfanyakazi mwingine kwa kazi ya bustani. Endelea kuomba, kazi zaidi zinakuja.',
      ],
    ),
    news(
      ['App update', 'The KaziForce app now loads faster on slow networks.'],
      [
        'Programu imeboreshwa',
        'Programu ya KaziForce sasa inafunguka haraka zaidi kwenye mtandao wa polepole.',
      ],
    ),
    news(
      [
        'Survey next month',
        'Next month we will ask a few workers for feedback. No action needed now.',
      ],
      [
        'Utafiti mwezi ujao',
        'Mwezi ujao tutawauliza wafanyakazi wachache maoni yao. Hakuna unachohitaji kufanya sasa.',
      ],
    ),
  ],
  [
    job(
      45,
      [
        'Urgent: house help needed this afternoon',
        'A family in South B needs house help from 3 pm today. Applications close in 45 minutes.',
      ],
      [
        'Haraka: msaidizi wa nyumbani anahitajika mchana huu',
        'Familia moja South B inahitaji msaidizi wa nyumbani kuanzia saa tisa leo. Maombi yanafungwa baada ya dakika 45.',
      ],
    ),
    job(
      5760,
      [
        'Security guard, night shifts next month',
        'A school in Kasarani needs a night guard from next month. Applications close in 4 days.',
      ],
      [
        'Mlinzi wa usiku mwezi ujao',
        'Shule moja Kasarani inahitaji mlinzi wa usiku kuanzia mwezi ujao. Maombi yanafungwa baada ya siku 4.',
      ],
    ),
    update(
      [
        'Job cancelled today',
        'The employer cancelled today’s cleaning job. Do not travel to the site.',
      ],
      [
        'Kazi ya leo imefutwa',
        'Mwajiri amefuta kazi ya usafi ya leo. Usisafiri kwenda eneo la kazi.',
      ],
    ),
    update(
      [
        'Payment sent',
        'The employer marked your last job as paid. Check your M-Pesa when you can.',
      ],
      [
        'Malipo yametumwa',
        'Mwajiri ameweka kazi yako ya mwisho kuwa imelipwa. Angalia M-Pesa yako ukipata nafasi.',
      ],
    ),
    news(
      ['Thank you', 'Thank you for using KaziForce this month.'],
      ['Asante', 'Asante kwa kutumia KaziForce mwezi huu.'],
    ),
    news(
      ['Profile photos', 'You can now add a profile photo from the settings page.'],
      ['Picha za wasifu', 'Sasa unaweza kuweka picha ya wasifu kwenye ukurasa wa mipangilio.'],
    ),
  ],
];

/** One round's alerts for one worker, in their language. */
export function roundFor(round: number, language: 'en' | 'sw', now: Date) {
  return ROUNDS[round - 1]!.map((item) => ({
    type: item.type,
    category: item.category,
    title: item[language].title,
    message: item[language].message + NOTE[language],
    deadlineAt:
      item.deadlineMinutes === null
        ? null
        : new Date(now.getTime() + item.deadlineMinutes * 60_000),
  }));
}
