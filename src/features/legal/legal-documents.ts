/**
 * The legal texts shipped with the application. They are content, not layout,
 * so a wording change never touches a component: the pages render whatever is
 * declared here. Every document carries its own version and date, so a user can
 * tell which revision the installed build shows.
 */
export type LegalSection = {
  heading: string
  paragraphs: string[]
  items?: string[]
}

export type LegalDocument = {
  title: string
  version: string
  updatedAt: string
  summary: string
  sections: LegalSection[]
}

export const termsOfService: LegalDocument = {
  title: 'Terms of Service',
  version: '1.0',
  updatedAt: '2026-09-04',
  summary:
    'WorkTimeTracker is open-source software that runs on your own machine against a database you control. There is no service behind it, so these terms describe how you may use the software and what it does not promise.',
  sections: [
    {
      heading: '1. Scope',
      paragraphs: [
        'These terms apply to your use of the WorkTimeTracker desktop application and its browser build. They are an agreement about the software itself; no account is created with the authors and no data is transmitted to them.',
      ],
    },
    {
      heading: '2. Licence',
      paragraphs: [
        'The software is licensed under the MIT licence. You may use, copy, modify and redistribute it under the conditions of that licence, which is included with every release and takes precedence over these terms wherever they differ.',
        'The dependencies keep their own licences. The full notices are listed in the application under "Third-Party Licenses".',
      ],
    },
    {
      heading: '3. Your responsibility',
      paragraphs: [
        'Because the software runs entirely under your control, you are responsible for:',
      ],
      items: [
        'the database or browser storage the data is written to, its access rights and its backups',
        'the accuracy and completeness of the times, breaks, absences and exports you record',
        'complying with the working time, tax and data protection obligations that apply to you or your organisation',
      ],
    },
    {
      heading: '4. Working time limits are guidance, not legal advice',
      paragraphs: [
        'The break, daily maximum and rest period checks use the German Working Time Act (ArbZG) as their default and can be changed in the settings. They are a convenience aid that highlights a possible conflict. They are not legal advice, not a certified time recording system and not a substitute for an audit-proof employer solution.',
        'The exported monthly record is generated from your own entries. Whether it satisfies a legal or contractual obligation is for you to verify.',
      ],
    },
    {
      heading: '5. No warranty',
      paragraphs: [
        'The software is provided "as is", without warranty of any kind, express or implied, including but not limited to merchantability, fitness for a particular purpose and non-infringement. There is no guarantee that it is free of errors, that recorded data is preserved or that it is available at any time.',
      ],
    },
    {
      heading: '6. Limitation of liability',
      paragraphs: [
        'To the extent permitted by applicable law, the authors and copyright holders are not liable for any claim, damages or other liability arising from the software or its use, including lost working time records, lost data or consequential damage. Liability that cannot be excluded by law remains unaffected.',
      ],
    },
    {
      heading: '7. Changes to these terms',
      paragraphs: [
        'A new release may ship a revised version of these terms. The version and the date above identify the revision contained in the installed build; an older build keeps the terms it was released with.',
      ],
    },
    {
      heading: '8. Privacy',
      paragraphs: [
        'How the application handles your data is described in the privacy policy, which you can open from the same menu.',
      ],
    },
  ],
}

export const privacyPolicy: LegalDocument = {
  title: 'Privacy Policy',
  version: '1.0',
  updatedAt: '2026-09-04',
  summary:
    'WorkTimeTracker is local-first. Your data stays in the database or browser storage you provide, no telemetry is collected and the application makes no network call other than to that database.',
  sections: [
    {
      heading: '1. Who is responsible',
      paragraphs: [
        'The authors of the software operate no server and receive no data from it. Because the application stores everything locally, you — or the organisation that deploys the application for you — are the controller of the data it holds.',
      ],
    },
    {
      heading: '2. What is stored',
      paragraphs: ['The application stores only the data you enter or that follows from it:'],
      items: [
        'your account: e-mail address and a hash of your password, never the password itself',
        'projects, project budgets and their notes',
        'time entries and breaks, including a running timer',
        'absences such as vacation, sick leave, unpaid and half days, and explicit overtime records',
        'your working time settings, such as the weekly target, the working days and the compliance limits',
        'audit trails for time entries, absences, overtime records and security-relevant actions; failed-login and lockout records are retained for 90 days, while the other audit records are append-only',
      ],
    },
    {
      heading: '3. Where it is stored',
      paragraphs: [
        'In the desktop application the data lives in the PostgreSQL database you configure, on your machine or on a server you control. In the browser build it lives in the local storage of that browser profile, separated per user.',
        'Every record is scoped to the user who created it, so several accounts on the same installation do not see each other’s data.',
      ],
    },
    {
      heading: '4. No tracking and no transmission',
      paragraphs: [
        'There is no analytics, no telemetry, no crash reporting and no advertising. Apart from the connection to your own database, the application makes no network request, so nothing you record leaves your environment through it.',
      ],
    },
    {
      heading: '5. Session handling',
      paragraphs: [
        'In the desktop application the session identifier is held in memory only and is not written to browser-readable storage; reloading the window signs you out and the abandoned backend session ends with its idle timeout.',
        'In the browser build the session token is stored in sessionStorage, and its timeout metadata is stored in localStorage under that token, so a reload keeps the session until it expires or you sign out.',
      ],
    },
    {
      heading: '6. Log files',
      paragraphs: [
        'Errors are written to a log file in the application data directory of your machine. Credentials, password hashes, e-mail addresses, connection strings and file system paths are redacted before anything is written, and the file is never transmitted anywhere.',
      ],
    },
    {
      heading: '7. Your data is in your hands',
      paragraphs: [
        'You can view and correct all records, delete projects, budgets, time entries, absences and overtime records, and export your monthly record as CSV or PDF.',
        'Audit trails are read-only: deleting a source record adds a delete audit row, and existing audit rows stay readable (except failed-login and lockout rows, which expire after 90 days).',
        'Deleting the database, or clearing the browser storage of the browser build, removes the stored data permanently; the authors hold no copy that could be requested or erased.',
      ],
    },
    {
      heading: '8. Changes to this policy',
      paragraphs: [
        'A new release may ship a revised version of this policy. The version and the date above identify the revision contained in the installed build.',
      ],
    },
    {
      heading: '9. Terms of service',
      paragraphs: [
        'The conditions under which the software is provided are described in the terms of service, which you can open from the same menu.',
      ],
    },
  ],
}
