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
  version: '1.1',
  updatedAt: '2026-09-04',
  summary:
    'WorkTimeTracker is open-source software that runs on your own machine, against a database you control when you self-host it, or against the hosted Postgres database in the European Union that the released production build connects to. These terms describe how you may use the software and what it does not promise.',
  sections: [
    {
      heading: '1. Scope',
      paragraphs: [
        'These terms apply to your use of the WorkTimeTracker desktop application and its browser build. They are an agreement about the software itself. Using a released production build means your data is stored in the hosted database in the European Union described in the privacy policy, which the authors administer and whose contents they may review to fix errors and to evaluate usage, while a self-hosted or browser build keeps the data in the storage you configured and transmits nothing to the authors.',
      ],
    },
    {
      heading: '2. License',
      paragraphs: [
        'The software is licensed under the MIT license. You may use, copy, modify and redistribute it under the conditions of that license, which is included with every release and takes precedence over these terms wherever they differ.',
        'The dependencies keep their own licenses. The full notices are listed in the application under "Third-Party Licenses".',
      ],
    },
    {
      heading: '3. Your responsibility',
      paragraphs: [
        'Because you decide how and where the software runs, you are responsible for:',
      ],
      items: [
        'the database or browser storage the data is written to, its access rights and its backups, including the credentials of your account in the hosted database of a released production build',
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
      heading: '7. No availability commitment',
      paragraphs: [
        'There is no uptime or availability commitment, neither for the software nor for the hosted database of the released production build, whose availability depends on a third-party provider. Export your records regularly so that a temporary or permanent loss of access to the database does not take your working time record with it.',
      ],
    },
    {
      heading: '8. Changes to these terms',
      paragraphs: [
        'A new release may ship a revised version of these terms. The version and the date above identify the revision contained in the installed build; an older build keeps the terms it was released with.',
      ],
    },
    {
      heading: '9. Privacy',
      paragraphs: [
        'How the application handles your data is described in the privacy policy, which you can open from the same menu.',
      ],
    },
  ],
}

export const privacyPolicy: LegalDocument = {
  title: 'Privacy Policy',
  version: '1.1',
  updatedAt: '2026-09-04',
  summary:
    'Where your data is stored depends on how you run WorkTimeTracker: a local, self-hosted or browser build keeps it in the database or browser storage you provide, while the released production build stores it in a Postgres database hosted by Supabase in the European Union. No telemetry is collected and the application makes no network call other than to that database. In the released production build the authors administer that database and may look at its contents to investigate errors and to evaluate how the application is used.',
  sections: [
    {
      heading: '1. Who is responsible',
      paragraphs: [
        'The authors of the software operate no service of their own beyond the database of the released production build, and a local or self-hosted deployment sends them nothing at all. You — or the organisation that deploys the application for you — are the controller of the data the application holds. For the released production build, Supabase, Inc. hosts the database as a processor, and the authors administer that database and can access the data stored in it, as described in the section on tracking and access below.',
      ],
    },
    {
      heading: '2. Where your data is stored',
      paragraphs: [
        'The application always writes to one database, but which one depends on the build you run.',
        'Local, development, self-hosted and browser builds: the data never leaves your machine or the database you configured. The connection is restricted to loopback hosts, and the browser build keeps everything in the storage of that browser profile.',
        'The released production build: the data is stored in a Postgres database operated by Supabase, Inc. on infrastructure located in the European Union. Supabase is the hosting provider of that database and processes the data only to run it. The connection is encrypted with TLS, and both the certificate chain and the host name are verified (sslmode=verify-full) against a pinned certificate authority; a certificate that cannot be verified aborts the start instead of falling back to an unencrypted connection.',
        'Everything listed under "What is stored" below is held in that hosted database when you use a released production build.',
        'The connection details are configuration, not part of the repository. A self-built or self-hosted deployment can point the application at any Postgres database it controls instead.',
      ],
    },
    {
      heading: '3. What is stored',
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
      heading: '4. Separation per user',
      paragraphs: [
        'Every record is scoped to the user who created it, so several accounts on the same installation or in the same database do not see each other’s data.',
      ],
    },
    {
      heading: '5. No tracking, and access by the authors',
      paragraphs: [
        'The application itself contains no analytics, no telemetry, no crash reporting and no advertising. The only network connection it makes is to the configured database, which in the released production build is the hosted database in the European Union described above. Nothing you record is sent to any analytics, advertising or tracking service, and no data is passed on to any other third party.',
        'In a local or self-hosted deployment the authors receive nothing. In the released production build the authors administer the hosted database and can therefore read the data stored in it. They access it only to investigate and fix errors and to evaluate how the application is used, they limit that access to what those purposes require, and they neither sell the data nor use it for advertising.',
      ],
    },
    {
      heading: '6. Session handling',
      paragraphs: [
        'In the desktop application the session identifier is held in memory only and is not written to browser-readable storage; reloading the window signs you out and the abandoned backend session ends with its idle timeout.',
        'In the browser build the session token is stored in sessionStorage, and its timeout metadata is stored in localStorage under that token, so a reload keeps the session until it expires or you sign out.',
      ],
    },
    {
      heading: '7. Log files',
      paragraphs: [
        'Errors are written to a log file in the application data directory of your machine. Credentials, password hashes, e-mail addresses, connection strings and file system paths are redacted before anything is written, and the file is never transmitted anywhere.',
      ],
    },
    {
      heading: '8. Your data is in your hands',
      paragraphs: [
        'You can view and correct all records, delete projects, budgets, time entries, absences and overtime records, and export your monthly record as CSV or PDF.',
        'Audit trails are read-only: deleting a source record adds a delete audit row, and existing audit rows stay readable (except failed-login and lockout rows, which expire after 90 days).',
        'Deleting the database, or clearing the browser storage of the browser build, removes the stored data permanently. In the released production build, deleting your account removes your rows from the hosted database, and the authors keep no separate copy of them outside it; backups of the hosted database expire on the schedule of the hosting provider.',
      ],
    },
    {
      heading: '9. Changes to this policy',
      paragraphs: [
        'A new release may ship a revised version of this policy. The version and the date above identify the revision contained in the installed build.',
      ],
    },
    {
      heading: '10. Terms of service',
      paragraphs: [
        'The conditions under which the software is provided are described in the terms of service, which you can open from the same menu.',
      ],
    },
  ],
}
