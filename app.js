'use strict';
/* =====================================================================
   ARCHITECTURE
   1. Core domain   workflow, roles, vocabularies, positions, formations
   2. Registry      sections and pages; drives sidebar, header and router
   3. Data layer    sources, repositories and stores, kept apart from the UI
   4. Demo data     Dashboard only, from the foundation phase
   5. UI kit        design-system components (pure functions -> HTML)
   6. Views         one renderer per built module; unbuilt pages use the scaffold
   7. Shell         sidebar and header
   8. Router and interactions

   To build a module: write its renderer and register it in VIEWS under
   the page id. The shell, registry and other modules stay untouched.
   ===================================================================== */

/* ---------------------------------------------------------------------
   1. CORE DOMAIN
   --------------------------------------------------------------------- */
const WORKFLOW = [
  { id: 'need',       label: 'Squad Need' },
  { id: 'search',     label: 'Player Search' },
  { id: 'scouting',   label: 'Scouting' },
  { id: 'comparison', label: 'Comparison' },
  { id: 'shortlist',  label: 'Shortlist' },
  { id: 'approval',   label: 'Approval' },
  { id: 'process',    label: 'Recruitment Process' },
  { id: 'signing',    label: 'Signing' },
  { id: 'planning',   label: 'Squad Planning' },
];
const STAGE = Object.fromEntries(WORKFLOW.map((s, i) => [s.id, { ...s, n: i + 1 }]));

/* Users, roles and permissions.
   A role is a default set of permissions; each member can carry overrides that add or remove
   single permissions. The Owner (who created this instance of the platform) always holds every
   permission, including ones added later. Permissions are checked in three places: what the
   interface shows, what each action and route allows, and what the database serves (see DB_RULES). */
const PERMISSION_MODULES = [
  { id: 'players', label: 'Players', icon: 'player', actions: [
    ['players.view', 'View players and profiles'],
    ['players.create', 'Add players', ['players.view']],
    ['players.edit', 'Edit player details', ['players.view']],
    ['players.delete', 'Delete players', ['players.view']],
    ['players.import', 'Import players from files', ['players.create']],
    ['notes.view', 'View notes', ['players.view']],
    ['notes.create', 'Write notes', ['notes.view']],
    ['notes.editOwn', 'Edit and delete own notes', ['notes.view']],
    ['notes.manage', 'Edit and delete others’ notes', ['notes.view']],
  ] },
  { id: 'scouting', label: 'Scouting', icon: 'eye', actions: [
    ['reports.viewOwn', 'View own reports'],
    ['reports.viewTeam', 'View team reports', ['reports.viewOwn']],
    ['reports.create', 'Create reports', ['reports.viewOwn', 'players.view']],
    ['reports.editOwn', 'Edit own reports', ['reports.viewOwn']],
    ['reports.editOthers', 'Edit others’ reports', ['reports.viewTeam']],
    ['reports.deleteOwn', 'Delete own reports', ['reports.viewOwn']],
    ['reports.deleteOthers', 'Delete others’ reports', ['reports.viewTeam']],
    ['assignments.viewOwn', 'View own assignments'],
    ['assignments.viewAll', 'View everyone’s assignments', ['assignments.viewOwn']],
    ['assignments.create', 'Create assignments for others', ['assignments.viewAll']],
    ['assignments.manage', 'Manage all assignments', ['assignments.viewAll']],
    ['criteria.view', 'View evaluation criteria'],
    ['criteria.manage', 'Edit evaluation criteria', ['criteria.view']],
  ] },
  { id: 'shortlists', label: 'Shortlists', icon: 'target', actions: [
    ['shortlists.view', 'View needs and shortlists'],
    ['shortlists.create', 'Create needs and add players', ['shortlists.view']],
    ['shortlists.edit', 'Edit needs and shortlists', ['shortlists.view']],
    ['shortlists.delete', 'Delete needs and remove players', ['shortlists.view']],
  ] },
  { id: 'shadow', label: 'Shadow Teams', icon: 'shadow', actions: [
    ['shadow.view', 'View shadow teams'],
    ['shadow.create', 'Create shadow teams', ['shadow.view']],
    ['shadow.edit', 'Edit shadow teams', ['shadow.view']],
    ['shadow.delete', 'Delete shadow teams', ['shadow.view']],
    ['shadow.addPlayers', 'Add and remove players', ['shadow.view']],
  ] },
  { id: 'squad', label: 'Squad', icon: 'shirt', actions: [
    ['squad.view', 'View the squad'],
    ['squad.edit', 'Edit the squad', ['squad.view']],
  ] },
  { id: 'recruitment', label: 'Recruitment', icon: 'transfer', server: 'owner', later: true, actions: [
    ['recruitment.view', 'View recruitment'],
    ['recruitment.create', 'Create recruitment processes', ['recruitment.view']],
    ['recruitment.edit', 'Edit recruitment processes', ['recruitment.view']],
    ['recruitment.manage', 'Manage negotiations', ['recruitment.view']],
  ] },
  { id: 'financial', label: 'Financial', icon: 'lock', server: 'owner', actions: [
    ['financial.viewMarket', 'View market information'],
    ['financial.viewAsking', 'View asking price'],
    ['financial.viewSalary', 'View salary'],
    ['financial.viewTransfer', 'View transfer costs'],
    ['financial.viewNotes', 'View internal financial notes'],
    ['financial.edit', 'Edit financial information', ['financial.viewMarket', 'financial.viewAsking', 'financial.viewSalary', 'financial.viewTransfer', 'financial.viewNotes']],
  ] },
  { id: 'admin', label: 'Administration', icon: 'shield', actions: [
    ['users.view', 'View users'],
    ['users.invite', 'Invite users', ['users.view'], 'owner'],
    ['users.editRole', 'Change roles', ['users.view'], 'owner'],
    ['users.editPermissions', 'Change permissions', ['users.view'], 'owner'],
    ['users.remove', 'Remove users', ['users.view'], 'owner'],
    ['org.settings', 'Organization settings', [], 'owner'],
    ['data.export', 'Export all data'],
  ] },
];
const PERMISSION = {};
PERMISSION_MODULES.forEach((m) => m.actions.forEach(([key, label, requires = [], server = m.server || '']) => {
  PERMISSION[key] = { key, label, requires, module: m.id, server };
}));
const ALL_PERMISSIONS = Object.keys(PERMISSION);
const VIEW_PERMISSIONS = new Set(ALL_PERMISSIONS.filter((k) => /\.view/.test(k)));
// Permissions the database keeps for the Owner only in this setup (see DB_RULES).
const ownerOnlyOnServer = (key) => PERMISSION[key] && PERMISSION[key].server === 'owner';

const ALL_BUT = (...keys) => ALL_PERMISSIONS.filter((k) => !keys.includes(k));
const ROLES = {
  owner: { label: 'Owner', desc: 'Created the organization. Full access to everything, always.' },
  sporting_director: {
    label: 'Sporting Director', share: 'Editor',
    desc: 'Runs the sporting side: players, scouting, shortlists, shadow teams, squad, recruitment and finances.',
    grants: ALL_BUT('users.invite', 'users.editRole', 'users.editPermissions', 'users.remove', 'org.settings'),
  },
  chief_scout: {
    label: 'Chief Scout', share: 'Contributor',
    desc: 'Leads the scouting department: reports, assignments and shortlists. No confidential finances.',
    grants: ['players.view', 'players.create', 'players.edit', 'players.import', 'notes.view', 'notes.create', 'notes.editOwn',
      'reports.viewOwn', 'reports.viewTeam', 'reports.create', 'reports.editOwn', 'reports.deleteOwn',
      'assignments.viewOwn', 'assignments.viewAll', 'assignments.create', 'assignments.manage', 'criteria.view', 'criteria.manage',
      'shortlists.view', 'shortlists.create', 'shortlists.edit', 'shortlists.delete', 'shadow.view', 'shadow.edit', 'shadow.addPlayers', 'users.view'],
  },
  scout: {
    label: 'Scout', share: 'Contributor',
    desc: 'Day-to-day scouting: players, own reports, own assignments and shortlists.',
    grants: ['players.view', 'players.create', 'players.edit', 'notes.view', 'notes.create', 'notes.editOwn',
      'reports.viewOwn', 'reports.create', 'reports.editOwn', 'reports.deleteOwn', 'assignments.viewOwn', 'criteria.view',
      'shortlists.view', 'shadow.view'],
  },
  analyst: {
    label: 'Analyst', share: 'Contributor',
    desc: 'Prepared for later configuration. Starts with viewing players only.',
    grants: ['players.view'],
  },
};
const INVITABLE_ROLES = ['sporting_director', 'chief_scout', 'scout', 'analyst'];

// Effective permissions: the role's defaults, then the member's overrides, then prerequisites
// (an action is dropped when something it needs, such as View, is missing).
function effectivePermissions(roleId, overrides = {}) {
  const set = new Set((ROLES[roleId] && ROLES[roleId].grants) || []);
  Object.entries(overrides || {}).forEach(([k, on]) => { if (!PERMISSION[k]) return; if (on) set.add(k); else set.delete(k); });
  let changed = true;
  while (changed) {
    changed = false;
    [...set].forEach((k) => { if (PERMISSION[k].requires.some((r) => !set.has(r))) { set.delete(k); changed = true; } });
  }
  return set;
}

// Shared vocabularies: one label and one tone per state, reused by every module.
const VOCAB = {
  need: {
    covered:  ['Covered',  'positive'],
    monitor:  ['Monitor',  'warning'],
    required: ['Required', 'danger'],
  },
  assignment: {
    confirmed:  ['Confirmed',      'positive'],
    pending:    ['Pending',        'warning'],
    travel:     ['Travel pending', 'warning'],
    unassigned: ['Unassigned',     'danger'],
  },
  priority: { high: 'High', medium: 'Medium', low: 'Low' },
  squadStatus: {
    available: ['Available', 'positive'],
    doubtful:  ['Doubtful',  'warning'],
    injured:   ['Injured',   'danger'],
    suspended: ['Suspended', 'warning'],
    loan:      ['On loan',   'neutral'],
  },
  needStatus: {
    open:      ['Open',        'warning'],
    progress:  ['In progress', 'accent'],
    filled:    ['Filled',      'positive'],
    cancelled: ['Cancelled',   'neutral'],
  },
  requestStatus: {
    open:      ['Open',      'warning'],
    done:      ['Done',      'positive'],
    cancelled: ['Cancelled', 'neutral'],
  },
};

// Season shown across the Squad pages.
const SEASON = { id: '2026-27', label: '2026/27', start: '2026-07-01', end: '2027-06-30' };
// The club using the platform.
const CLUB = { name: 'Leixões S.C.', competition: 'Liga Portugal 2' };
// The organization. Each club runs its own instance of the platform, with its own database and its
// own share list, so one club's data can never be read from another club's instance.
const ORG = { id: 'leixoes-sc', name: CLUB.name };
// The platform's address, used in invitation messages.
const APP_URL = location.origin;
// Shown for the Owner when the platform does not give a display name.
const OWNER_NAME = 'Hermógenes Morim';

// Recruitment needs
const NEED_WINDOWS = [
  { id: 'jan-2027',    label: 'January 2027' },
  { id: 'summer-2027', label: 'Summer 2027' },
  { id: 'later',       label: 'Later' },
];
const NEED_WINDOW = Object.fromEntries(NEED_WINDOWS.map((w, i) => [w.id, { ...w, order: i }]));
const NEED_REASONS = [
  { id: 'contract',    label: 'Contract ending' },
  { id: 'depth',       label: 'Lack of depth' },
  { id: 'sale',        label: 'Possible sale' },
  { id: 'injury',      label: 'Injury cover' },
  { id: 'loan',        label: 'Loan ending' },
  { id: 'quality',     label: 'Raise quality' },
  { id: 'development', label: 'Development' },
];
const NEED_REASON = Object.fromEntries(NEED_REASONS.map((r) => [r.id, r]));
const NEED_STATUS_ORDER = { open: 0, progress: 1, filled: 2, cancelled: 3 };
const DEAL_TYPES = { any: 'Any', permanent: 'Permanent', loan: 'Loan', free: 'Free agent' };
const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };
// Positions always listed in squad depth, even when empty.
const CORE_POSITIONS = ['GK', 'RB', 'CB', 'LB', 'DM', 'CM', 'AM', 'RW', 'LW', 'ST'];
// Scouting method (specification v1.0)
const LEVELS = [
  { v: 1, label: 'Below Liga 2' },
  { v: 2, label: 'Liga 2 squad player' },
  { v: 3, label: 'Liga 2 starter' },
  { v: 4, label: 'Top Liga 2 / Liga Portugal squad' },
  { v: 5, label: 'Liga Portugal starter or above' },
];
const levelLabel = (v) => (LEVELS.find((l) => l.v === v) || {}).label || '';
const GRADES = [{ v: 1, label: 'Weak' }, { v: 2, label: 'Adequate' }, { v: 3, label: 'Good' }, { v: 4, label: 'Very good' }];
const gradeLabel = (v) => (GRADES.find((g) => g.v === v) || {}).label || '';
const DIMENSIONS = [
  { id: 'technical', label: 'Technical' },
  { id: 'tactical',  label: 'Tactical' },
  { id: 'physical',  label: 'Physical' },
  { id: 'mental',    label: 'Mental' },
];
const RECOMMENDATIONS = [
  { id: 'sign',    label: 'Sign / Priority', tone: 'positive', action: 'Add to the need’s shortlist' },
  { id: 'again',   label: 'See again',       tone: 'neutral',  action: 'Request another observation' },
  { id: 'monitor', label: 'Monitor',         tone: 'neutral',  action: 'Keep on the watchlist' },
  { id: 'no',      label: 'Not for us',      tone: 'danger',   action: 'Close the player' },
];
const RECOMMENDATION = Object.fromEntries(RECOMMENDATIONS.map((r) => [r.id, r]));
const CLOSE_REASONS = { level: 'Level', profile: 'Profile / fit', cost: 'Cost', character: 'Character', other: 'Other' };
const VENUES = { live: 'Live', video: 'Video' };
const ATTRIBUTE_GROUPS = [
  { id: 'gk',   label: 'Goalkeeper',               positions: ['GK'] },
  { id: 'cb',   label: 'Centre-back',              positions: ['CB'] },
  { id: 'fb',   label: 'Full-back / wing-back',    positions: ['RB', 'LB', 'RWB', 'LWB'] },
  { id: 'dm',   label: 'Defensive midfielder',     positions: ['DM'] },
  { id: 'cm',   label: 'Central midfielder',       positions: ['CM'] },
  { id: 'am',   label: 'Attacking midfielder',     positions: ['AM'] },
  { id: 'wide', label: 'Winger / wide midfielder', positions: ['RW', 'LW', 'RM', 'LM'] },
  { id: 'st',   label: 'Striker',                  positions: ['ST'] },
];
const ATTRIBUTE_GROUP_OF = Object.fromEntries(ATTRIBUTE_GROUPS.flatMap((g) => g.positions.map((p) => [p, g.id])));
const MIN_ATTRIBUTES = 4;
const MAX_ATTRIBUTES = 6;
const DEFAULT_ATTRIBUTES = {
  gk:   ['Shot stopping', 'Handling', 'Command of the area', '1v1', 'Distribution', 'Play with feet'],
  cb:   ['Aerial duels', '1v1 defending', 'Build-up passing', 'Positioning', 'Recovery pace'],
  fb:   ['1v1 defending', 'Recovery pace', 'Crossing', 'Attacking runs', 'Stamina'],
  dm:   ['Positioning', 'Ball winning', 'Passing range', 'Press resistance', 'Aerial duels'],
  cm:   ['Passing', 'Press resistance', 'Ball carrying', 'Work rate', 'Arriving in the box'],
  am:   ['Final pass', 'Receiving between lines', 'Shooting', 'Creativity', 'Pressing'],
  wide: ['1v1 dribbling', 'Pace', 'Final ball', 'Finishing', 'Defensive work'],
  st:   ['Finishing', 'Movement in the box', 'Hold-up play', 'Aerial threat', 'Pressing'],
};


// A player's natural position. Formation slots (LCB, RCB…) are a separate list below.
const PLAYER_POSITIONS = [
  { id: 'GK',  label: 'Goalkeeper',           group: 'gk' },
  { id: 'RB',  label: 'Right-back',           group: 'def' },
  { id: 'CB',  label: 'Centre-back',          group: 'def' },
  { id: 'LB',  label: 'Left-back',            group: 'def' },
  { id: 'RWB', label: 'Right wing-back',      group: 'def' },
  { id: 'LWB', label: 'Left wing-back',       group: 'def' },
  { id: 'DM',  label: 'Defensive midfielder', group: 'mid' },
  { id: 'CM',  label: 'Central midfielder',   group: 'mid' },
  { id: 'AM',  label: 'Attacking midfielder', group: 'mid' },
  { id: 'RM',  label: 'Right midfielder',     group: 'mid' },
  { id: 'LM',  label: 'Left midfielder',      group: 'mid' },
  { id: 'RW',  label: 'Right winger',         group: 'fwd' },
  { id: 'LW',  label: 'Left winger',          group: 'fwd' },
  { id: 'ST',  label: 'Striker',              group: 'fwd' },
];
const PLAYER_POSITION = Object.fromEntries(PLAYER_POSITIONS.map((p, i) => [p.id, { ...p, order: i }]));
const POSITION_GROUPS = [
  { id: 'gk',   label: 'Goalkeepers' },
  { id: 'def',  label: 'Defenders' },
  { id: 'mid',  label: 'Midfielders' },
  { id: 'fwd',  label: 'Forwards' },
  { id: 'none', label: 'Position not set' },
];
// Formation slots a natural position can fill, best match first.
const SLOT_FIT = {
  GK: ['GK'], RB: ['RB', 'RWB'], CB: ['CB', 'LCB', 'RCB'], LB: ['LB', 'LWB'],
  RWB: ['RWB', 'RB', 'RM'], LWB: ['LWB', 'LB', 'LM'], DM: ['DM', 'LDM', 'RDM'],
  CM: ['LCM', 'RCM', 'DM', 'LDM', 'RDM'], AM: ['AM', 'LCM', 'RCM'],
  RM: ['RM', 'RW', 'RWB'], LM: ['LM', 'LW', 'LWB'], RW: ['RW', 'RM'], LW: ['LW', 'LM'], ST: ['ST', 'LST', 'RST'],
};
const FEET = { right: 'Right', left: 'Left', both: 'Both' };
const SQUAD_ROLES = ['Key player', 'Regular starter', 'Rotation', 'Backup', 'Youth / reserves'];
const MARKET_AVAILABILITY = ['Not on the market', 'Open to offers', 'Transfer-listed', 'Loan possible', 'Contract expiring', 'Free agent'];
const COUNTRIES = ['Albania', 'Algeria', 'Andorra', 'Angola', 'Argentina', 'Armenia', 'Australia', 'Austria', 'Azerbaijan', 'Belarus', 'Belgium', 'Benin', 'Bolivia', 'Bosnia and Herzegovina', 'Brazil', 'Bulgaria', 'Burkina Faso', 'Burundi', 'Cameroon', 'Canada', 'Cape Verde', 'Central African Republic', 'Chad', 'Chile', 'China', 'Colombia', 'Comoros', 'Congo', 'Costa Rica', 'Croatia', 'Cuba', 'Curaçao', 'Cyprus', 'Czech Republic', 'Denmark', 'DR Congo', 'Dominican Republic', 'Ecuador', 'Egypt', 'El Salvador', 'England', 'Equatorial Guinea', 'Estonia', 'Ethiopia', 'Faroe Islands', 'Finland', 'France', 'Gabon', 'Gambia', 'Georgia', 'Germany', 'Ghana', 'Gibraltar', 'Greece', 'Guadeloupe', 'Guatemala', 'Guinea', 'Guinea-Bissau', 'Haiti', 'Honduras', 'Hungary', 'Iceland', 'India', 'Indonesia', 'Iran', 'Iraq', 'Israel', 'Italy', 'Ivory Coast', 'Jamaica', 'Japan', 'Jordan', 'Kazakhstan', 'Kenya', 'Kosovo', 'Kuwait', 'Latvia', 'Lebanon', 'Liberia', 'Libya', 'Liechtenstein', 'Lithuania', 'Luxembourg', 'Madagascar', 'Mali', 'Malta', 'Martinique', 'Mauritania', 'Mexico', 'Moldova', 'Montenegro', 'Morocco', 'Mozambique', 'Namibia', 'Netherlands', 'New Zealand', 'Nicaragua', 'Niger', 'Nigeria', 'North Macedonia', 'Northern Ireland', 'Norway', 'Panama', 'Paraguay', 'Peru', 'Poland', 'Portugal', 'Qatar', 'Republic of Ireland', 'Romania', 'Russia', 'Rwanda', 'São Tomé and Príncipe', 'Saudi Arabia', 'Scotland', 'Senegal', 'Serbia', 'Sierra Leone', 'Slovakia', 'Slovenia', 'South Africa', 'South Korea', 'Spain', 'Suriname', 'Sweden', 'Switzerland', 'Togo', 'Trinidad and Tobago', 'Tunisia', 'Turkey', 'Uganda', 'Ukraine', 'United Arab Emirates', 'United States', 'Uruguay', 'Uzbekistan', 'Venezuela', 'Wales', 'Zambia', 'Zimbabwe'];

// The club's relationship with a player, in order.
const INTERNAL_STATUS = [
  { id: 'untracked',   label: 'Untracked',          short: 'Untracked' },
  { id: 'monitoring',  label: 'Monitoring',         short: 'Monitoring' },
  { id: 'scouting',    label: 'Scouting',           short: 'Scouting' },
  { id: 'shortlisted', label: 'Shortlisted',        short: 'Shortlisted' },
  { id: 'target',      label: 'Recruitment Target', short: 'Target' },
];

const POSITIONS = {
  GK: 'Goalkeeper',
  LB: 'Left-back', RB: 'Right-back', LWB: 'Left wing-back', RWB: 'Right wing-back',
  LCB: 'Left centre-back', CB: 'Centre-back', RCB: 'Right centre-back',
  DM: 'Defensive midfielder', LDM: 'Defensive midfielder (left)', RDM: 'Defensive midfielder (right)',
  LCM: 'Central midfielder (left)', RCM: 'Central midfielder (right)',
  LM: 'Left midfielder', RM: 'Right midfielder', AM: 'Attacking midfielder',
  LW: 'Left winger', RW: 'Right winger',
  ST: 'Striker', LST: 'Striker (left)', RST: 'Striker (right)',
};

// Horizontal pitch in %: x from own goal (0) to opponent goal (100), y from left touchline (0) to right (100).
const FORMATIONS = {
  '4-3-3':   [['GK',6,50],['LB',25,14],['LCB',21,37],['RCB',21,63],['RB',25,86],['DM',41,50],['LCM',56,29],['RCM',56,71],['LW',77,15],['ST',84,50],['RW',77,85]],
  '4-2-3-1': [['GK',6,50],['LB',25,14],['LCB',21,37],['RCB',21,63],['RB',25,86],['LDM',41,35],['RDM',41,65],['LW',68,15],['AM',63,50],['RW',68,85],['ST',84,50]],
  '4-4-2':   [['GK',6,50],['LB',25,14],['LCB',21,37],['RCB',21,63],['RB',25,86],['LM',54,13],['LCM',48,38],['RCM',48,62],['RM',54,87],['LST',79,37],['RST',79,63]],
  '4-1-4-1': [['GK',6,50],['LB',25,14],['LCB',21,37],['RCB',21,63],['RB',25,86],['DM',39,50],['LM',61,13],['LCM',58,36],['RCM',58,64],['RM',61,87],['ST',84,50]],
  '3-4-3':   [['GK',6,50],['LCB',22,25],['CB',19,50],['RCB',22,75],['LWB',48,11],['LCM',46,37],['RCM',46,63],['RWB',48,89],['LW',75,19],['ST',84,50],['RW',75,81]],
  '3-5-2':   [['GK',6,50],['LCB',22,25],['CB',19,50],['RCB',22,75],['LWB',49,11],['LCM',56,31],['DM',42,50],['RCM',56,69],['RWB',49,89],['LST',80,37],['RST',80,63]],
};
const FORMATION_IDS = Object.keys(FORMATIONS);
const DEFAULT_FORMATION = '4-3-3';

// Order in a shadow-team position list is the priority.
const SHADOW_TIERS = ['Primary target', 'Alternative', 'Development option'];
const tierLabel = (i) => SHADOW_TIERS[i] || `Option ${i + 1}`;

// Player profile tabs. Video is reserved and switched on in a later phase.
const PROFILE_TABS = [
  { id: 'overview',    label: 'Overview' },
  { id: 'performance', label: 'Performance', enabled: false },   // returns with a data provider
  { id: 'scouting',    label: 'Scouting' },
  { id: 'career',      label: 'Career', enabled: false },        // returns when career history is recorded
  { id: 'contract',    label: 'Contract', icon: 'lock', restricted: true },
  { id: 'notes',       label: 'Notes' },
  { id: 'video',       label: 'Video', enabled: false },
];

// Metric groups. Metrics are defined later, with the data provider.
const PERFORMANCE_GROUPS = [
  { id: 'playing-time', label: 'Playing time', icon: 'clock',   metrics: [] },
  { id: 'attacking',    label: 'Attacking',    icon: 'target',  metrics: [] },
  { id: 'passing',      label: 'Passing',      icon: 'arrow',   metrics: [] },
  { id: 'possession',   label: 'Possession',   icon: 'ball',    metrics: [] },
  { id: 'defending',    label: 'Defending',    icon: 'shield',  metrics: [] },
  { id: 'physical',     label: 'Physical',     icon: 'pulse',   metrics: [] },
];

// Player actions: three always visible, the rest under More actions.
const PLAYER_ACTIONS = {
  primary: [
    { id: 'shortlist', label: 'Add to Shortlist', icon: 'plus', variant: 'primary', module: 'Shortlists', ready: true },
    { id: 'scout',     label: 'Scout Player',     icon: 'eye',     module: 'Scouting', ready: true },
    { id: 'compare',   label: 'Compare',          icon: 'compare', module: 'Compare Players' },
  ],
  more: [
    { id: 'shadow',      label: 'Add to Shadow Team', icon: 'shadow', action: 'open-add-shadow' },
    { id: 'recruitment', label: 'Add to Recruitment', icon: 'target' },
    { id: 'note',        label: 'Create Note',        icon: 'note' },
    { id: 'export',      label: 'Export',             icon: 'download' },
    { id: 'share',       label: 'Share Internally',   icon: 'share' },
  ],
};

const NOTE_CATEGORIES = ['General', 'Scouting', 'Recruitment', 'Contract', 'Character'];

/* ---------------------------------------------------------------------
   2. REGISTRY
   layout = placeholder structure for an unbuilt page
   stages = where the page sits in WORKFLOW
   --------------------------------------------------------------------- */
const SPEC_PLAYERS = 'https://claude.ai/code/artifact/59f4ae7e-7bed-462e-8d8c-790f1d3efc38';

const SECTIONS = [
  { id: 'players', label: 'Players', icon: 'player', pages: [
    { id: 'players-search',   label: 'Search Players',  stages: ['search'],             layout: 'search',  spec: SPEC_PLAYERS, purpose: 'Find players who match the profile of a squad need.' },
    { id: 'players-database', label: 'Player Database', stages: ['search'],             purpose: 'Every player the department tracks, entered manually.' },
    { id: 'player-profile',   label: 'Player Profile',  stages: ['search', 'scouting'], purpose: 'Everything the club knows about one player.' },
    { id: 'players-compare',  label: 'Compare Players', stages: ['comparison'],         layout: 'compare', purpose: 'Candidates for the same role, side by side.' },
  ]},
  { id: 'scouting', label: 'Scouting', icon: 'eye', pages: [
    { id: 'scouting-overview',    label: 'Scouting Dashboard',  stages: ['scouting'], layout: 'overview', purpose: 'Coverage and output of the scouting department.' },
    { id: 'scouting-reports',     label: 'Observation Reports', stages: ['scouting'], purpose: 'Every report filed after observing a player.' },
    { id: 'scouting-assignments', label: 'Assignments',         stages: ['scouting'], purpose: 'Who watches which player, where and by when.' },
    { id: 'scouting-activity',    label: 'Scout Activity',      stages: ['scouting'], layout: 'overview', purpose: 'Workload and activity of each scout.' },
    { id: 'scouting-criteria',    label: 'Evaluation Criteria', stages: ['scouting'], purpose: 'The scales and position attributes used in reports.' },
  ]},
  { id: 'recruitment', label: 'Recruitment', icon: 'target', pages: [
    { id: 'recruitment-board',      label: 'Recruitment Board', stages: ['shortlist', 'approval', 'process', 'signing'], layout: 'board', purpose: 'Where every target stands, from shortlist to signing.' },
    { id: 'recruitment-shortlists', label: 'Shortlists',        stages: ['shortlist', 'approval'], layout: 'split', purpose: 'Ranked candidate lists for each squad need.' },
    { id: 'recruitment-targets',    label: 'Target Players',    stages: ['process', 'signing'],    layout: 'table', purpose: 'Players the club is actively pursuing.' },
  ]},
  { id: 'squad', label: 'Squad', icon: 'shirt', pages: [
    { id: 'squad-first-team',   label: 'First Team',         stages: ['planning'],         purpose: `Our squad for the ${SEASON.label} season.` },
    { id: 'squad-analysis',     label: 'Squad Analysis',     stages: ['need'],             layout: 'overview', purpose: 'Squad structure by position, age and contract.' },
    { id: 'squad-depth',        label: 'Depth Chart',        stages: ['need', 'planning'], layout: 'pitch',    purpose: 'Squad players for each position, in order of preference.' },
    { id: 'squad-shadow-teams', label: 'Shadow Teams',       stages: ['need', 'planning'], purpose: 'Alternatives for every position, kept apart from the real squad.' },
    { id: 'squad-needs',        label: 'Recruitment Needs',  stages: ['need'],             purpose: 'Positions to strengthen, with priority, window and candidates.' },
    { id: 'squad-contracts',    label: 'Contract Situation', stages: ['need', 'planning'], layout: 'table',    purpose: 'Contract end dates and renewal status.' },
  ]},
  { id: 'settings', label: 'Settings', icon: 'settings', pages: [
    { id: 'settings-users', label: 'Users & Permissions', stages: [], purpose: 'Members of the organization, their roles and permissions.' },
  ]},
  { id: 'market', label: 'Market', icon: 'transfer', pages: [
    { id: 'market-opportunities', label: 'Transfer Opportunities', stages: ['search'], layout: 'table', purpose: 'Players known to be available.' },
    { id: 'market-free-agents',   label: 'Free Agents',            stages: ['search'], layout: 'table', purpose: 'Players currently without a club.' },
    { id: 'market-expiring',      label: 'Expiring Contracts',     stages: ['search'], layout: 'table', purpose: 'Players in the final year of their contract.' },
  ]},
];

const PAGES = {
  'dashboard':     { id: 'dashboard',     label: 'Dashboard',     icon: 'dashboard', section: null },
  'design-system': { id: 'design-system', label: 'Design System', icon: 'layers',    section: null },
};
SECTIONS.forEach((s) => s.pages.forEach((p) => { PAGES[p.id] = { ...p, section: s }; }));
const DEFAULT_ROUTE = 'dashboard';

/* ---------------------------------------------------------------------
   2b. LANGUAGE
   The interface is written in English. Portuguese (Portugal) is applied as a
   layer over everything the page renders, so modules need no changes to be
   translated: add the English text and its Portuguese below. Saved data keeps
   its ids and stored values in every language; only what is shown changes.
   --------------------------------------------------------------------- */
const PT_TEXT = {
  // Shell and navigation
  'Scouting & Recruitment': 'Scouting e Recrutamento',
  'Main navigation': 'Navegação principal',
  'Modules': 'Módulos',
  'Open navigation': 'Abrir navegação',
  'Breadcrumb': 'Localização',
  'Language': 'Idioma',
  'Export all': 'Exportar tudo',
  'Theme': 'Tema',
  'Light': 'Claro',
  'Dark': 'Escuro',
  'Download everything you can see in one Excel file': 'Transferir tudo o que pode ver num único ficheiro Excel',
  'Dashboard': 'Painel',
  'Players': 'Jogadores',
  'Search Players': 'Pesquisar jogadores',
  'Player Database': 'Base de dados de jogadores',
  'Player Profile': 'Perfil do jogador',
  'Compare Players': 'Comparar jogadores',
  'Scouting': 'Scouting',
  'Scouting Dashboard': 'Painel de scouting',
  'Observation Reports': 'Relatórios de observação',
  'Assignments': 'Tarefas',
  'Scout Activity': 'Atividade dos scouts',
  'Evaluation Criteria': 'Critérios de avaliação',
  'Recruitment': 'Recrutamento',
  'Recruitment Board': 'Quadro de recrutamento',
  'Shortlists': 'Shortlists',
  'Target Players': 'Jogadores-alvo',
  'Squad': 'Plantel',
  'First Team': 'Equipa principal',
  'Squad Analysis': 'Análise do plantel',
  'Depth Chart': 'Hierarquia por posição',
  'Shadow Teams': 'Equipas sombra',
  'Recruitment Needs': 'Necessidades de recrutamento',
  'Contract Situation': 'Situação contratual',
  'Settings': 'Definições',
  'Users & Permissions': 'Utilizadores e permissões',
  'Market': 'Mercado',
  'Transfer Opportunities': 'Oportunidades de transferência',
  'Free Agents': 'Jogadores livres',
  'Expiring Contracts': 'Contratos a terminar',
  'Design System': 'Design System',
  'Find players who match the profile of a squad need.': 'Encontrar jogadores que correspondem ao perfil de uma necessidade do plantel.',
  'Every player the department tracks, entered manually.': 'Todos os jogadores que o departamento acompanha, introduzidos manualmente.',
  'Everything the club knows about one player.': 'Tudo o que o clube sabe sobre um jogador.',
  'Candidates for the same role, side by side.': 'Candidatos para a mesma função, lado a lado.',
  'Coverage and output of the scouting department.': 'Cobertura e produção do departamento de scouting.',
  'Every report filed after observing a player.': 'Todos os relatórios feitos após observar um jogador.',
  'Who watches which player, where and by when.': 'Quem observa que jogador, onde e até quando.',
  'Workload and activity of each scout.': 'Carga de trabalho e atividade de cada scout.',
  'The scales and position attributes used in reports.': 'As escalas e os atributos por posição usados nos relatórios.',
  'Where every target stands, from shortlist to signing.': 'O ponto de situação de cada alvo, da shortlist à contratação.',
  'Ranked candidate lists for each squad need.': 'Listas ordenadas de candidatos para cada necessidade do plantel.',
  'Players the club is actively pursuing.': 'Jogadores que o clube está a tentar contratar.',
  'Squad structure by position, age and contract.': 'Estrutura do plantel por posição, idade e contrato.',
  'Squad players for each position, in order of preference.': 'Jogadores do plantel para cada posição, por ordem de preferência.',
  'Alternatives for every position, kept apart from the real squad.': 'Alternativas para cada posição, separadas do plantel real.',
  'Positions to strengthen, with priority, window and candidates.': 'Posições a reforçar, com prioridade, janela e candidatos.',
  'Contract end dates and renewal status.': 'Datas de fim de contrato e estado das renovações.',
  'Members of the organization, their roles and permissions.': 'Membros da organização, os seus perfis e permissões.',
  'Players known to be available.': 'Jogadores que se sabe estarem disponíveis.',
  'Players currently without a club.': 'Jogadores atualmente sem clube.',
  'Players in the final year of their contract.': 'Jogadores no último ano de contrato.',

  // Workflow
  'Squad Need': 'Necessidade do plantel',
  'Player Search': 'Pesquisa de jogadores',
  'Comparison': 'Comparação',
  'Shortlist': 'Shortlist',
  'Approval': 'Aprovação',
  'Recruitment Process': 'Processo de recrutamento',
  'Signing': 'Contratação',
  'Squad Planning': 'Planeamento do plantel',

  // Permissions
  'View players and profiles': 'Ver jogadores e perfis',
  'Add players': 'Adicionar jogadores',
  'Edit player details': 'Editar dados dos jogadores',
  'Delete players': 'Eliminar jogadores',
  'Import players from files': 'Importar jogadores de ficheiros',
  'View notes': 'Ver notas',
  'Write notes': 'Escrever notas',
  'Edit and delete own notes': 'Editar e eliminar as próprias notas',
  'Edit and delete others’ notes': 'Editar e eliminar notas de outros',
  'View own reports': 'Ver os próprios relatórios',
  'View team reports': 'Ver relatórios da equipa',
  'Create reports': 'Criar relatórios',
  'Edit own reports': 'Editar os próprios relatórios',
  'Edit others’ reports': 'Editar relatórios de outros',
  'Delete own reports': 'Eliminar os próprios relatórios',
  'Delete others’ reports': 'Eliminar relatórios de outros',
  'View own assignments': 'Ver as próprias tarefas',
  'View everyone’s assignments': 'Ver as tarefas de todos',
  'Create assignments for others': 'Criar tarefas para outros',
  'Manage all assignments': 'Gerir todas as tarefas',
  'View evaluation criteria': 'Ver critérios de avaliação',
  'Edit evaluation criteria': 'Editar critérios de avaliação',
  'View needs and shortlists': 'Ver necessidades e shortlists',
  'Create needs and add players': 'Criar necessidades e adicionar jogadores',
  'Edit needs and shortlists': 'Editar necessidades e shortlists',
  'Delete needs and remove players': 'Eliminar necessidades e retirar jogadores',
  'View shadow teams': 'Ver equipas sombra',
  'Create shadow teams': 'Criar equipas sombra',
  'Edit shadow teams': 'Editar equipas sombra',
  'Delete shadow teams': 'Eliminar equipas sombra',
  'Add and remove players': 'Adicionar e retirar jogadores',
  'View the squad': 'Ver o plantel',
  'Edit the squad': 'Editar o plantel',
  'View recruitment': 'Ver recrutamento',
  'Create recruitment processes': 'Criar processos de recrutamento',
  'Edit recruitment processes': 'Editar processos de recrutamento',
  'Manage negotiations': 'Gerir negociações',
  'Financial': 'Financeiro',
  'View market information': 'Ver informação de mercado',
  'View asking price': 'Ver preço pedido',
  'View salary': 'Ver salário',
  'View transfer costs': 'Ver custos de transferência',
  'View internal financial notes': 'Ver notas financeiras internas',
  'Edit financial information': 'Editar informação financeira',
  'Administration': 'Administração',
  'View users': 'Ver utilizadores',
  'Invite users': 'Convidar utilizadores',
  'Change roles': 'Alterar perfis',
  'Change permissions': 'Alterar permissões',
  'Remove users': 'Remover utilizadores',
  'Organization settings': 'Definições da organização',
  'Export all data': 'Exportar todos os dados',

  // Roles
  'Owner': 'Proprietário',
  'Sporting Director': 'Diretor Desportivo',
  'Chief Scout': 'Chief Scout',
  'Scout': 'Scout',
  'Analyst': 'Analista',
  'Created the organization. Full access to everything, always.': 'Criou a organização. Acesso total a tudo, sempre.',
  'Runs the sporting side: players, scouting, shortlists, shadow teams, squad, recruitment and finances.': 'Dirige a área desportiva: jogadores, scouting, shortlists, equipas sombra, plantel, recrutamento e finanças.',
  'Leads the scouting department: reports, assignments and shortlists. No confidential finances.': 'Lidera o departamento de scouting: relatórios, tarefas e shortlists. Sem finanças confidenciais.',
  'Day-to-day scouting: players, own reports, own assignments and shortlists.': 'Scouting do dia a dia: jogadores, relatórios e tarefas próprios, e shortlists.',
  'Prepared for later configuration. Starts with viewing players only.': 'Preparado para configuração posterior. Começa apenas com a consulta de jogadores.',

  // Vocabularies
  'Covered': 'Coberta',
  'Monitor': 'Acompanhar',
  'Required': 'Necessária',
  'Confirmed': 'Confirmada',
  'Pending': 'Pendente',
  'Travel pending': 'Viagem pendente',
  'Unassigned': 'Sem scout',
  'High': 'Alta',
  'Medium': 'Média',
  'Low': 'Baixa',
  'Available': 'Disponível',
  'Doubtful': 'Em dúvida',
  'Injured': 'Lesionado',
  'Suspended': 'Suspenso',
  'On loan': 'Emprestado',
  'Open': 'Em aberto',
  'In progress': 'Em curso',
  'Filled': 'Preenchida',
  'Cancelled': 'Cancelada',
  'Done': 'Concluir',
  'January 2027': 'Janeiro de 2027',
  'Summer 2027': 'Verão de 2027',
  'Later': 'Mais tarde',
  'Contract ending': 'Fim de contrato',
  'Lack of depth': 'Falta de opções',
  'Possible sale': 'Possível venda',
  'Injury cover': 'Cobertura de lesão',
  'Loan ending': 'Fim de empréstimo',
  'Raise quality': 'Subir a qualidade',
  'Development': 'Desenvolvimento',
  'Any': 'Qualquer',
  'Permanent': 'Definitivo',
  'Loan': 'Empréstimo',
  'Free agent': 'Jogador livre',
  'Below Liga 2': 'Abaixo da Liga 2',
  'Liga 2 squad player': 'Jogador de plantel da Liga 2',
  'Liga 2 starter': 'Titular na Liga 2',
  'Top Liga 2 / Liga Portugal squad': 'Destaque da Liga 2 / plantel da Liga Portugal',
  'Liga Portugal starter or above': 'Titular na Liga Portugal ou acima',
  'Weak': 'Fraco',
  'Adequate': 'Suficiente',
  'Good': 'Bom',
  'Very good': 'Muito bom',
  'Technical': 'Técnica',
  'Tactical': 'Tática',
  'Physical': 'Física',
  'Mental': 'Mental',
  'Sign / Priority': 'Contratar / Prioridade',
  'See again': 'Ver de novo',
  'Not for us': 'Não interessa',
  'Add to the need’s shortlist': 'Adicionar à shortlist da necessidade',
  'Request another observation': 'Pedir nova observação',
  'Keep on the watchlist': 'Manter em acompanhamento',
  'Close the player': 'Fechar o jogador',
  'Level': 'Nível',
  'Profile / fit': 'Perfil / encaixe',
  'Cost': 'Custo',
  'Character': 'Carácter',
  'Other': 'Outro',
  'Live': 'Ao vivo',
  'Video': 'Vídeo',
  'Right': 'Direito',
  'Left': 'Esquerdo',
  'Both': 'Ambos',
  'Key player': 'Jogador-chave',
  'Regular starter': 'Titular habitual',
  'Rotation': 'Rotação',
  'Backup': 'Suplente',
  'Youth / reserves': 'Formação / equipa B',
  'Not on the market': 'Fora do mercado',
  'Open to offers': 'Aberto a propostas',
  'Transfer-listed': 'Transferível',
  'Loan possible': 'Empréstimo possível',
  'Contract expiring': 'Contrato a terminar',
  'Untracked': 'Sem acompanhamento',
  'Monitoring': 'Em acompanhamento',
  'Monitoring (watchlist)': 'Em acompanhamento (watchlist)',
  'Shortlisted': 'Na shortlist',
  'Recruitment Target': 'Alvo de recrutamento',
  'Target': 'Alvo',
  'Primary target': 'Alvo principal',
  'Alternative': 'Alternativa',
  'Development option': 'Opção de desenvolvimento',
  'General': 'Geral',
  'Contract': 'Contrato',
  'Notes': 'Notas',

  // Positions
  'GK': 'GR', 'RB': 'DD', 'CB': 'DC', 'LB': 'DE', 'RWB': 'ALD', 'LWB': 'ALE', 'DM': 'MDC', 'CM': 'MC', 'AM': 'MO',
  'RM': 'MD', 'LM': 'ME', 'RW': 'ED', 'LW': 'EE', 'ST': 'PL',
  'LCB': 'DCE', 'RCB': 'DCD', 'LDM': 'MDE', 'RDM': 'MDD', 'LCM': 'MCE', 'RCM': 'MCD', 'LST': 'PLE', 'RST': 'PLD',
  'Goalkeeper': 'Guarda-redes',
  'Right-back': 'Defesa direito',
  'Centre-back': 'Defesa central',
  'Left-back': 'Defesa esquerdo',
  'Right wing-back': 'Ala direito',
  'Left wing-back': 'Ala esquerdo',
  'Defensive midfielder': 'Médio defensivo',
  'Central midfielder': 'Médio centro',
  'Attacking midfielder': 'Médio ofensivo',
  'Right midfielder': 'Médio direito',
  'Left midfielder': 'Médio esquerdo',
  'Right winger': 'Extremo direito',
  'Left winger': 'Extremo esquerdo',
  'Striker': 'Ponta de lança',
  'Left centre-back': 'Defesa central (esquerdo)',
  'Right centre-back': 'Defesa central (direito)',
  'Defensive midfielder (left)': 'Médio defensivo (esquerdo)',
  'Defensive midfielder (right)': 'Médio defensivo (direito)',
  'Central midfielder (left)': 'Médio centro (esquerdo)',
  'Central midfielder (right)': 'Médio centro (direito)',
  'Striker (left)': 'Ponta de lança (esquerdo)',
  'Striker (right)': 'Ponta de lança (direito)',
  'Goalkeepers': 'Guarda-redes',
  'Defenders': 'Defesas',
  'Midfielders': 'Médios',
  'Forwards': 'Avançados',
  'Position not set': 'Posição por definir',
  'Full-back / wing-back': 'Lateral / ala',
  'Winger / wide midfielder': 'Extremo / médio ala',

  // Default attributes
  'Shot stopping': 'Defesa de remates',
  'Handling': 'Segurança de mãos',
  'Command of the area': 'Domínio da área',
  '1v1': '1x1',
  'Distribution': 'Reposição de bola',
  'Play with feet': 'Jogo de pés',
  'Aerial duels': 'Duelos aéreos',
  '1v1 defending': 'Defesa 1x1',
  'Build-up passing': 'Passe na construção',
  'Positioning': 'Posicionamento',
  'Recovery pace': 'Velocidade de recuperação',
  'Crossing': 'Cruzamento',
  'Attacking runs': 'Projeção ofensiva',
  'Stamina': 'Resistência',
  'Ball winning': 'Recuperação de bola',
  'Passing range': 'Alcance de passe',
  'Press resistance': 'Resistência à pressão',
  'Passing': 'Passe',
  'Ball carrying': 'Condução de bola',
  'Work rate': 'Capacidade de trabalho',
  'Arriving in the box': 'Chegada à área',
  'Final pass': 'Último passe',
  'Receiving between lines': 'Receção entre linhas',
  'Shooting': 'Remate',
  'Creativity': 'Criatividade',
  'Pressing': 'Pressão',
  '1v1 dribbling': 'Drible 1x1',
  'Pace': 'Velocidade',
  'Final ball': 'Bola final (passe/cruzamento)',
  'Finishing': 'Finalização',
  'Defensive work': 'Trabalho defensivo',
  'Movement in the box': 'Movimentação na área',
  'Hold-up play': 'Jogo de costas',
  'Aerial threat': 'Ameaça aérea',

  // Profile
  'Overview': 'Resumo',
  'Performance': 'Desempenho',
  'Career': 'Carreira',
  'Playing time': 'Tempo de jogo',
  'Attacking': 'Ataque',
  'Possession': 'Posse',
  'Defending': 'Defesa',
  'Add to Shortlist': 'Adicionar à shortlist',
  'Scout Player': 'Observar jogador',
  'Compare': 'Comparar',
  'Add to Shadow Team': 'Adicionar a equipa sombra',
  'Add to Recruitment': 'Adicionar ao recrutamento',
  'Create Note': 'Criar nota',
  'Export': 'Exportar',
  'Share Internally': 'Partilhar internamente',
  'More actions': 'Mais ações',
  'Edit positions': 'Editar posições',
  'Age': 'Idade',
  'Nationality': 'Nacionalidade',
  'Club': 'Clube',
  'Position': 'Posição',
  'Add position': 'Adicionar posição',
  'Also plays': 'Também joga',
  'Foot': 'Pé',
  'Contract until': 'Contrato até',
  'Value': 'Valor',
  'Agent': 'Agente',
  'Open a player from the Player Database first.': 'Abra primeiro um jogador a partir da Base de dados de jogadores.',
  'Squad details': 'Dados no plantel',
  'Edit player': 'Editar jogador',
  'Delete player': 'Eliminar jogador',
  'No player selected': 'Nenhum jogador selecionado',
  'Open a player from the': 'Abra um jogador a partir da',
  'to load a profile.': 'para carregar um perfil.',
  '· imported': '· importada',
  '· edited': '· editada',
  'Edit note': 'Editar nota',
  'Delete note': 'Eliminar nota',
  'Note': 'Nota',
  'The note cannot be empty.': 'A nota não pode estar vazia.',
  'Category': 'Categoria',
  'Save changes': 'Guardar alterações',
  'Delete this note?': 'Eliminar esta nota?',
  'Full name': 'Nome completo',
  'Date of birth': 'Data de nascimento',
  'Height': 'Altura',
  'Second nationality': 'Segunda nacionalidade',
  'Primary position': 'Posição principal',
  'Secondary positions': 'Posições secundárias',
  'Preferred foot': 'Pé preferido',
  'Competition': 'Competição',
  'Squad role': 'Papel no plantel',
  'Availability': 'Disponibilidade',
  'Reopen': 'Reabrir',
  'Due': 'Para rever',
  'Recruitment needs': 'Necessidades de recrutamento',
  'Profile': 'Perfil',
  'Current situation': 'Situação atual',
  'Internal status': 'Estado interno',
  'Internal status steps': 'Etapas do estado interno',
  'Not available': 'Não disponível',
  'Season': 'Época',
  'View': 'Vista',
  'Table': 'Tabela',
  'Chart': 'Gráfico',
  'Percentiles vs same position': 'Percentis face à mesma posição',
  'No data provider connected': 'Sem fornecedor de dados ligado',
  'Metric groups': 'Grupos de métricas',
  'Metrics appear here once a data provider is connected.': 'As métricas aparecem aqui quando houver um fornecedor de dados ligado.',
  'No recommendation yet': 'Ainda sem recomendação',
  'Summary': 'Resumo',
  'Reports': 'Relatórios',
  'Observations': 'Observações',
  'Last observed': 'Última observação',
  'Scouts': 'Scouts',
  'No observations yet': 'Ainda sem observações',
  'Nobody has observed this player': 'Ninguém observou este jogador',
  'Strengths & concerns': 'Pontos fortes e preocupações',
  'No strengths or concerns recorded': 'Sem pontos fortes nem preocupações registados',
  'No career history available': 'Sem histórico de carreira disponível',
  'Career history': 'Histórico de carreira',
  'Move': 'Mover',
  'Edit contract': 'Editar contrato',
  'Financial information is restricted to authorised roles.': 'A informação financeira está reservada a perfis autorizados.',
  'Current contract': 'Contrato atual',
  'End date': 'Data de fim',
  'Option': 'Opção',
  'Loan situation': 'Situação de empréstimo',
  'No financial notes.': 'Sem notas financeiras.',
  'Write the note first.': 'Escreva primeiro a nota.',
  'Add note': 'Adicionar nota',
  'Open a player to add notes': 'Abra um jogador para adicionar notas',
  'Write a note…': 'Escreva uma nota…',
  'No notes yet': 'Ainda sem notas',
  'History': 'Histórico',
  'Market value': 'Valor de mercado',
  'Asking price': 'Preço pedido',
  'Salary': 'Salário',
  'Transfer cost': 'Custo de transferência',
  'Financial notes': 'Notas financeiras',
  'Separate from the real squad': 'Separada do plantel real',
  'Unnamed player': 'Jogador sem nome',
  'Untitled': 'Sem título',
  'Someone': 'Alguém',

  // Dashboard
  'Key figures': 'Números principais',
  'Players scouted': 'Jogadores observados',
  'Season to date': 'Época até à data',
  'Reports this month': 'Relatórios este mês',
  'Open assignments': 'Tarefas em aberto',
  'None overdue': 'Nenhuma em atraso',
  'Nothing planned': 'Nada planeado',
  'Recruitment priorities': 'Prioridades de recrutamento',
  'No active needs': 'Sem necessidades ativas',
  'Player unavailable': 'Jogador indisponível',
  'Recruitment Priorities': 'Prioridades de recrutamento',
  'No active recruitment needs': 'Sem necessidades de recrutamento ativas',
  'Create a need': 'Criar uma necessidade',
  'Squad Needs': 'Necessidades do plantel',
  'Ending': 'A terminar',
  'Need': 'Necessidade',
  'Open need': 'Em aberto',
  'Squad depth and open needs by position': 'Profundidade do plantel e necessidades em aberto por posição',
  'My Assignments': 'As minhas tarefas',
  'Watch by': 'Observar até',
  'Player': 'Jogador',
  'Match': 'Jogo',
  'No open assignments': 'Sem tarefas em aberto',
  'To Review': 'A rever',
  'Review on': 'Rever em',
  'Watchlist players with a review date': 'Jogadores em acompanhamento com data para rever',
  'No players to review': 'Sem jogadores para rever',
  'A report that recommends “Monitor” sets a review date.': 'Um relatório que recomenda “Acompanhar” define uma data para rever.',
  'Latest Reports': 'Últimos relatórios',
  'Date': 'Data',
  'Type': 'Tipo',
  'Recommendation': 'Recomendação',
  'Latest observation reports': 'Últimos relatórios de observação',
  'No reports yet': 'Ainda sem relatórios',
  'Nothing to show yet': 'Ainda nada para mostrar',
  'Your role does not include any of the areas summarised here.': 'O seu perfil não inclui nenhuma das áreas resumidas aqui.',
  'Not built yet': 'Ainda não construído',
  'This module is designed and built in its own phase.': 'Este módulo é desenhado e construído na sua própria fase.',
  'Planned layout': 'Estrutura prevista',
  'Specification': 'Especificação',

  // Player Database
  'Latest report: current level → potential': 'Último relatório: nível atual → potencial',
  'Status': 'Estado',
  'Our squad': 'O nosso plantel',
  'Review due': 'Rever',
  'No players match these filters': 'Nenhum jogador corresponde a estes filtros',
  'Clear filters': 'Limpar filtros',
  'Loading players…': 'A carregar jogadores…',
  'No players yet': 'Ainda sem jogadores',
  'Add players one by one, or import a list from Excel or CSV. Only the name is required.': 'Adicione jogadores um a um ou importe uma lista de Excel ou CSV. Só o nome é obrigatório.',
  'Add player': 'Adicionar jogador',
  'Import from file': 'Importar de ficheiro',
  'All': 'Todos',
  'External': 'Externos',
  'Search players': 'Pesquisar jogadores',
  'Search name, club, nationality': 'Pesquisar nome, clube, nacionalidade',
  'Show': 'Mostrar',
  'All positions': 'Todas as posições',
  'All statuses': 'Todos os estados',
  'Import': 'Importar',
  'New player': 'Novo jogador',

  // First Team
  'Loading squad…': 'A carregar o plantel…',
  'Add each player in this season’s squad, or import the whole squad from Excel or CSV.': 'Adicione cada jogador do plantel desta época ou importe o plantel inteiro de Excel ou CSV.',
  'Import squad from file': 'Importar plantel de ficheiro',
  'players': 'jogadores',
  'average age': 'idade média',
  'unavailable': 'indisponíveis',
  'on loan': 'emprestados',
  'Actions': 'Ações',

  // Needs
  'No squad loaded': 'Sem plantel carregado',
  'Squad depth by position': 'Profundidade do plantel por posição',
  'Pos': 'Pos.',
  'Squad players who list this as a secondary position': 'Jogadores do plantel que têm esta posição como secundária',
  'Also': 'Também',
  'Avg age': 'Idade média',
  'Needs': 'Necessidades',
  'New need': 'Nova necessidade',
  'Squad by position': 'Plantel por posição',
  'Priority': 'Prioridade',
  'Window': 'Janela',
  'Candidates': 'Candidatos',
  'Active': 'Ativas',
  'Loading needs…': 'A carregar necessidades…',
  'No recruitment needs yet': 'Ainda sem necessidades de recrutamento',
  'Record each position to strengthen. Squad depth by position helps decide where.': 'Registe cada posição a reforçar. A profundidade do plantel por posição ajuda a decidir onde.',
  'Choose All to see filled and cancelled needs.': 'Escolha Todas para ver as necessidades preenchidas e canceladas.',
  'Mark as open': 'Marcar como em aberto',
  'Mark as in progress': 'Marcar como em curso',
  'Mark as filled': 'Marcar como preenchida',
  'Mark as cancelled': 'Marcar como cancelada',
  'Edit': 'Editar',
  'Need actions': 'Ações da necessidade',
  'Delete need': 'Eliminar necessidade',
  'All needs': 'Todas as necessidades',
  'Full report missing': 'Falta relatório completo',
  'A candidate needs a full report. Write it now.': 'Um candidato precisa de um relatório completo. Escreva-o agora.',
  'Remove candidate': 'Retirar candidato',
  'No candidates yet': 'Ainda sem candidatos',
  'Add players from the Player Database, or from a profile with More actions › Link to a need.': 'Adicione jogadores a partir da Base de dados de jogadores ou do perfil, com Adicionar à shortlist.',
  'In shadow teams': 'Nas equipas sombra',
  'Add': 'Adicionar',
  'Add candidate': 'Adicionar candidato',
  'Deal type': 'Tipo de negócio',
  'Age range': 'Faixa etária',
  'Related squad player': 'Jogador do plantel relacionado',
  'No reasons recorded.': 'Sem motivos registados.',
  'Ends this season': 'Termina esta época',
  'contract end not set': 'fim de contrato por definir',
  'No squad players at this position.': 'Sem jogadores do plantel nesta posição.',
  'Reasons': 'Motivos',
  'Details': 'Detalhes',
  'this position': 'esta posição',

  // Scouting
  'Full': 'Completo',
  'Quick': 'Rápido',
  'Current level': 'Nível atual',
  'Potential': 'Potencial',
  'Dimensions': 'Dimensões',
  'Attributes': 'Atributos',
  'Strengths': 'Pontos fortes',
  'None recorded.': 'Nada registado.',
  'None recorded': 'Nada registado',
  'Concerns': 'Preocupações',
  'Linked need:': 'Necessidade associada:',
  'Delete': 'Eliminar',
  'Latest level': 'Último nível',
  'Level scale 1–5 ·': 'Escala de níveis 1–5 ·',
  'Evaluation criteria': 'Critérios de avaliação',
  'Quick report': 'Relatório rápido',
  'Full report': 'Relatório completo',
  'Start with a quick report after a first observation. A full report is required once the player is a candidate for a need.': 'Comece com um relatório rápido após uma primeira observação. É obrigatório um relatório completo quando o jogador é candidato a uma necessidade.',
  'Average current level': 'Nível atual médio',
  'Latest recommendation': 'Última recomendação',
  'Seen live': 'Visto ao vivo',
  'No reports match these filters': 'Nenhum relatório corresponde a estes filtros',
  'Observation reports': 'Relatórios de observação',
  'New report': 'Novo relatório',
  'Loading reports…': 'A carregar relatórios…',
  'Write the first report here, or with Scout Player on a player’s profile.': 'Escreva aqui o primeiro relatório ou use Observar jogador no perfil de um jogador.',
  'Search reports': 'Pesquisar relatórios',
  'Search player, match, competition': 'Pesquisar jogador, jogo, competição',
  'All types': 'Todos os tipos',
  'All recommendations': 'Todas as recomendações',
  'New assignment': 'Nova tarefa',
  'Loading…': 'A carregar…',
  'No assignments yet': 'Ainda sem tarefas',
  'Players to watch appear here. A report that recommends “See again” creates one too.': 'Os jogadores a observar aparecem aqui. Um relatório que recomenda “Ver de novo” também cria uma.',
  'Write report': 'Escrever relatório',
  'Observation actions': 'Ações da tarefa',
  'Mark as done': 'Marcar como concluída',
  'Cancel': 'Cancelar',
  'All assignments': 'Todas as tarefas',
  'My assignments': 'As minhas tarefas',
  'Level scale': 'Escala de níveis',
  'Grades': 'Graus',
  'Add attribute': 'Adicionar atributo',
  'Attributes by position': 'Atributos por posição',
  'used in full reports': 'relatórios completos',
  'Save criteria': 'Guardar critérios',
  'Changes apply to new reports. Existing reports keep the attributes they were written with.': 'As alterações aplicam-se aos novos relatórios. Os relatórios existentes mantêm os atributos com que foram escritos.',
  'The scales and position attributes used in every report.': 'As escalas e os atributos por posição usados em todos os relatórios.',
  'Current level and potential in 2 seasons': 'Nível atual e potencial daqui a 2 épocas',
  'Dimensions and attributes · no middle point': 'Dimensões e atributos · sem ponto médio',
  'no middle point': 'sem ponto médio',
  'Reset to defaults': 'Repor predefinições',
  'Remove attribute': 'Remover atributo',
  'Storage is not available in this view, so changes last until the page is closed.': 'O armazenamento não está disponível nesta vista; as alterações duram até fechar a página.',
  'Not saved': 'Não guardado',

  // Shadow teams
  'New shadow team': 'Nova equipa sombra',
  'Loading shadow teams…': 'A carregar equipas sombra…',
  'No shadow teams yet': 'Ainda sem equipas sombra',
  'Build a parallel squad of alternatives for every position.': 'Construa um plantel paralelo de alternativas para cada posição.',
  'Create shadow team': 'Criar equipa sombra',
  'Shadow team': 'Equipa sombra',
  'Formation': 'Sistema',
  'Shadow team actions': 'Ações da equipa sombra',
  'Rename': 'Mudar o nome',
  'Delete shadow team': 'Eliminar equipa sombra',
  'Not in this formation': 'Fora deste sistema',
  'Move to position': 'Mover para posição',
  'Positions': 'Posições',
  'Players listed per position': 'Jogadores por posição',
  'First option': 'Primeira opção',
  'Move up': 'Subir',
  'Move down': 'Descer',
  'Move to another position': 'Mover para outra posição',
  'Remove from list': 'Retirar da lista',
  'Empty': 'Vazio',
  'Drop here to add at the end': 'Largue aqui para adicionar no fim',
  'Add players from their profile, under More actions. Drag to reorder or onto another position.': 'Adicione jogadores a partir do perfil, em Mais ações. Arraste para reordenar ou para outra posição.',
  'Rename shadow team': 'Mudar o nome da equipa sombra',
  'e.g. Summer recruitment': 'ex.: Recrutamento de verão',
  'Enter a name for the shadow team.': 'Indique um nome para a equipa sombra.',
  'Name': 'Nome',
  'Save': 'Guardar',
  'Create': 'Criar',
  'Its position lists are removed. Player records are not affected.': 'As listas por posição são removidas. Os registos dos jogadores não são afetados.',
  'Add at the end': 'Adicionar no fim',
  'No player loaded': 'Nenhum jogador carregado',
  'Open a player to add them to a shadow team.': 'Abra um jogador para o adicionar a uma equipa sombra.',
  '(optional)': '(opcional)',
  'No shadow teams yet.': 'Ainda sem equipas sombra.',
  'Create one in Squad › Shadow Teams': 'Crie uma em Plantel › Equipas sombra',
  'Could not save the change. Your access may be view-only.': 'Não foi possível guardar a alteração. O seu acesso pode ser só de leitura.',
  'Could not save. Your access may be view-only.': 'Não foi possível guardar. O seu acesso pode ser só de leitura.',
  'Could not delete. Your access may be view-only.': 'Não foi possível eliminar. O seu acesso pode ser só de leitura.',

  // Player and squad dialogs
  'Enter the player’s name.': 'Indique o nome do jogador.',
  'Shirt number': 'Número da camisola',
  'Use a number from 1 to 99.': 'Use um número de 1 a 99.',
  'Height (cm)': 'Altura (cm)',
  'e.g. Signed July 2024': 'ex.: Assinado em julho de 2024',
  'e.g. +1 year, club option': 'ex.: +1 ano, opção do clube',
  'Contract club': 'Clube do contrato',
  'e.g. €2.5M': 'ex.: 2,5 M€',
  'Only the name is required. The rest can be completed later in the profile.': 'Só o nome é obrigatório. O resto pode ser completado mais tarde no perfil.',
  'Save and add another': 'Guardar e adicionar outro',
  'Save and open': 'Guardar e abrir',
  'Choose the primary position.': 'Escolha a posição principal.',
  'Save and next': 'Guardar e seguinte',
  'Save and open the next squad player without a position': 'Guardar e abrir o próximo jogador do plantel sem posição',
  'Save and open the next player without a position': 'Guardar e abrir o próximo jogador sem posição',
  'Save positions': 'Guardar posições',
  'This removes the player, their squad place and any shadow-team places. It cannot be undone.': 'Isto remove o jogador, o seu lugar no plantel e nas equipas sombra. Esta ação não pode ser anulada.',
  'Remove from squad': 'Retirar do plantel',
  'Add to squad': 'Adicionar ao plantel',
  'Edit need': 'Editar necessidade',
  'New recruitment need': 'Nova necessidade de recrutamento',
  'Choose a position.': 'Escolha uma posição.',
  'Profile wanted': 'Perfil pretendido',
  'e.g. Left-footed, comfortable building from the back': 'ex.: Canhoto, à vontade na construção desde trás',
  'Age from': 'Idade de',
  'Age to': 'Idade até',
  'Age to must be at least Age from.': '“Idade até” tem de ser igual ou superior a “Idade de”.',
  'Create need': 'Criar necessidade',
  'Delete this need?': 'Eliminar esta necessidade?',
  'No matching players': 'Nenhum jogador encontrado',
  'No external players in the Player Database yet': 'Ainda sem jogadores externos na Base de dados de jogadores',
  'Players matching the position are listed first. Not in the list? Add them in the Player Database.': 'Os jogadores da posição aparecem primeiro. Não está na lista? Adicione-o na Base de dados de jogadores.',
  'No active needs yet.': 'Ainda sem necessidades ativas.',
  'Create one in Squad › Recruitment Needs': 'Crie uma em Plantel › Necessidades de recrutamento',
  'Add to shortlist': 'Adicionar à shortlist',

  // Report dialogs
  'Choose a value.': 'Escolha um valor.',
  'Choose a grade.': 'Escolha um grau.',
  'Choose the position played to grade its attributes.': 'Escolha a posição em que jogou para avaliar os atributos.',
  'Choose a recommendation.': 'Escolha uma recomendação.',
  'e.g. Reads the game early': 'ex.: Lê o jogo cedo',
  'e.g. Struggles against pace': 'ex.: Tem dificuldades contra jogadores rápidos',
  'Report type': 'Tipo de relatório',
  'Linked need': 'Necessidade associada',
  'A report linked to a need is always a full report.': 'Um relatório associado a uma necessidade é sempre completo.',
  'Seen': 'Visto',
  'Position played': 'Posição em que jogou',
  'Reason': 'Motivo',
  'Choose a reason.': 'Escolha um motivo.',
  'Edit report': 'Editar relatório',
  'No details yet': 'Ainda sem dados',
  'None': 'Nenhuma',
  'Enter the date of the observation.': 'Indique a data da observação.',
  'e.g. Home v Away': 'ex.: Casa x Fora',
  'Minutes watched': 'Minutos observados',
  'Potential in 2 seasons': 'Potencial daqui a 2 épocas',
  'Position attributes': 'Atributos da posição',
  'What the player showed, and how he fits': 'O que o jogador mostrou e como encaixa',
  '1 to 3 lines': '1 a 3 linhas',
  'Save report': 'Guardar relatório',
  'There are no active needs yet.': 'Ainda não há necessidades ativas.',
  'Create one in Recruitment Needs': 'Crie uma em Necessidades de recrutamento',
  'already a candidate': 'já é candidato',
  'Optional': 'Opcional',
  'What to look at next time': 'O que observar da próxima vez',
  'Report saved': 'Relatório guardado',
  'Next step ·': 'Próximo passo ·',
  'Skip': 'Saltar',
  'Confirm': 'Confirmar',
  'Close': 'Fechar',
  'Report': 'Relatório',
  'Open profile': 'Abrir perfil',
  'Delete this report?': 'Eliminar este relatório?',
  'Delete report': 'Eliminar relatório',
  'The Player Database is empty': 'A Base de dados de jogadores está vazia',
  'Choose': 'Escolher',
  'Search the Player Database': 'Pesquisar na Base de dados de jogadores',
  'Not in the list? Add the player in the Player Database first.': 'Não está na lista? Adicione primeiro o jogador na Base de dados de jogadores.',
  'Not in the list?': 'Não está na lista?',
  'Add a new player': 'Adicionar novo jogador',
  'Not in the list? Someone with permission to add players must add them first.': 'Não está na lista? Tem de ser adicionado primeiro por alguém com permissão para adicionar jogadores.',
  'The player is added to the Player Database. Only the name is required.': 'O jogador é adicionado à Base de dados de jogadores. Só o nome é obrigatório.',
  'Save and write report': 'Guardar e escrever relatório',
  'Search or type a new name': 'Pesquisar ou escrever um nome novo',
  'Choose a player or type a name.': 'Escolha um jogador ou escreva um nome.',
  'Added to the Player Database when you save.': 'É adicionado à Base de dados de jogadores ao guardar.',
  'Change': 'Mudar',
  'Other scout…': 'Outro scout…',
  'Scout name': 'Nome do scout',
  'Enter the scout’s name.': 'Indique o nome do scout.',
  'Assigned to': 'Atribuída a',
  'Edit assignment': 'Editar tarefa',
  'What to look at': 'O que observar',
  'Create assignment': 'Criar tarefa',
  'no reason': 'sem motivo',

  // Users & Permissions
  'Owner only': 'Só o proprietário',
  'No access': 'Sem acesso',
  'Full access': 'Acesso total',
  'View only': 'Só ver',
  'Partial access': 'Acesso parcial',
  'This area is not built yet. Its permissions are prepared for later.': 'Esta área ainda não está construída. As permissões ficam preparadas para mais tarde.',
  'The server keeps this information for the Owner only in this setup.': 'Nesta configuração, o servidor reserva esta informação ao proprietário.',
  'Some of these actions are kept for the Owner on the server in this setup.': 'Nesta configuração, algumas destas ações estão reservadas ao proprietário no servidor.',
  'Different from the role’s defaults': 'Diferente das predefinições do perfil',
  'Custom': 'Personalizado',
  'Waiting for approval': 'A aguardar aprovação',
  'Invited': 'Convidado',
  'Invite user': 'Convidar utilizador',
  'Email': 'Email',
  'Role': 'Perfil',
  'Last active': 'Última atividade',
  'Not joined yet': 'Ainda não entrou',
  'You': 'Você',
  'The Owner always keeps full access': 'O proprietário mantém sempre acesso total',
  'Member actions': 'Ações do membro',
  'Role and permissions': 'Perfil e permissões',
  'Remove from organization': 'Remover da organização',
  'Activate': 'Ativar',
  'Decline': 'Recusar',
  'Invitation actions': 'Ações do convite',
  'Copy invitation message': 'Copiar mensagem de convite',
  'Revoke invitation': 'Revogar convite',
  'Members': 'Membros',
  'Inviting here sets the role and permissions. Access to the platform itself is given from the Share menu, with the same email.': 'O convite aqui define o perfil e as permissões. O acesso à plataforma em si é dado no menu Share do claude.ai, com o mesmo email.',
  'Share menu access': 'Acesso no menu Share',
  'Access': 'Acesso',
  'Email not available': 'Email não disponível',
  'Not seen yet': 'Ainda não visto',
  'Editor access in the Share menu also lets this person publish new versions of the platform. Contributor is enough for this role when your Claude plan offers it.': 'O acesso de Editor no menu Share também permite a esta pessoa publicar novas versões da plataforma. Contributor chega para este perfil quando o seu plano Claude o permite.',
  'Changing the role resets the permissions to that role’s defaults.': 'Mudar o perfil repõe as permissões predefinidas desse perfil.',
  'Reset to role defaults': 'Repor predefinições do perfil',
  'They lose access to every area straight away. Their reports, notes and assignments stay.': 'Perde de imediato o acesso a todas as áreas. Os seus relatórios, notas e tarefas mantêm-se.',
  'Remove': 'Remover',
  'Invitation': 'Convite',
  'Choose the invitation for this person.': 'Escolha o convite desta pessoa.',
  'Choose an invitation': 'Escolha um convite',
  'There are no open invitations. Invite this person first, then activate them here.': 'Não há convites em aberto. Convide primeiro esta pessoa e depois ative-a aqui.',
  'Activate access': 'Ativar acesso',
  'This email does not match any open invitation. Check it is the person you invited, then choose their invitation.': 'Este email não corresponde a nenhum convite em aberto. Confirme que é a pessoa que convidou e escolha o convite.',
  'claude.ai shows the name of the person, not their email. Check it is the person you invited, then choose their invitation.': 'O claude.ai mostra o nome da pessoa, não o email. Confirme que é a pessoa que convidou e escolha o convite.',
  'Permissions': 'Permissões',
  'Send': 'Enviar',
  'Invitation steps': 'Passos do convite',
  'Back': 'Voltar',
  'Use the email of their Claude account. You will share the platform with the same email.': 'Use o email da conta Claude da pessoa. Vai partilhar a plataforma com o mesmo email.',
  'Enter a valid email address.': 'Indique um endereço de email válido.',
  'Next': 'Seguinte',
  'Create invitation': 'Criar convite',
  'Invitation created': 'Convite criado',
  'Open the': 'Abra o menu',
  'menu of this platform and share it with': 'desta plataforma e partilhe-a com',
  'as': 'como',
  'Send them the message below.': 'Envie-lhe a mensagem abaixo.',
  'When they open the platform and request access, activate them here.': 'Quando abrir a plataforma e pedir acesso, ative-o aqui.',
  'Message': 'Mensagem',
  'Copy message': 'Copiar mensagem',

  // Access screens
  'You don’t have permission to do this.': 'Não tem permissão para fazer isto.',
  'You don’t have permission to access this area.': 'Não tem permissão para aceder a esta área.',
  'Go to the Dashboard': 'Ir para o Painel',
  'Checking your access…': 'A verificar o seu acesso…',
  'We couldn’t confirm your account': 'Não foi possível confirmar a sua conta',
  'Sign in to claude.ai with the account you were invited with, then reload this page.': 'Inicie sessão no claude.ai com a conta para a qual foi convidado e volte a carregar esta página.',
  'Access requested': 'Acesso pedido',
  'Your access is paused': 'O seu acesso está suspenso',
  'Your access from the Share menu is view-only. Ask the Owner to share the platform with you as Contributor or Editor, then reload.': 'O seu acesso no menu Share é só de leitura. Peça ao proprietário que partilhe a plataforma consigo como Contributor ou Editor e volte a carregar.',
  'If you were invited, request access. The Owner activates it from Users & Permissions.': 'Se foi convidado, peça acesso. O proprietário ativa-o em Utilizadores e permissões.',
  'Request access': 'Pedir acesso',
  'Inviting here sets the role and permissions. The person creates an account with the invited email and gets in as soon as they confirm it.': 'O convite define o perfil e as permissões. A pessoa cria conta com o email do convite e entra assim que o confirmar.',
  'They will create their account with this email.': 'A pessoa vai criar a conta com este email.',
  'They create their account with this email and confirm it.': 'A pessoa cria a conta com este email e confirma-o.',
  'Their access opens by itself, with the role and permissions you chose.': 'O acesso abre-se sozinho, com o perfil e as permissões que escolheu.',
  'Sign out and sign in again with the email you were invited with.': 'Termine a sessão e entre de novo com o email para o qual foi convidado.',
  'Could not send the request. Try again in a moment.': 'Não foi possível enviar o pedido. Tente daqui a pouco.',
  'Sign out': 'Terminar sessão',

  // Import
  'Yes': 'Sim',
  'No': 'Não',
  'Column': 'Coluna',
  'What to enter': 'O que preencher',
  'Downloads are not available in this view. The recognised column names are listed below.': 'As transferências não estão disponíveis nesta vista. Os nomes de coluna reconhecidos estão listados abaixo.',
  'The template could not be downloaded here.': 'Não foi possível transferir o modelo aqui.',
  'The file could not be read. Check it is a valid .xlsx file.': 'Não foi possível ler o ficheiro. Confirme que é um ficheiro .xlsx válido.',
  'This browser can’t read Excel files. Save the file as .csv and try again.': 'Este navegador não consegue ler ficheiros Excel. Guarde o ficheiro como .csv e tente de novo.',
  'The first sheet of the file is empty.': 'A primeira folha do ficheiro está vazia.',
  'Import players': 'Importar jogadores',
  'Start from the template': 'Comece pelo modelo',
  'One player per row. Only Name is required.': 'Um jogador por linha. Só o Nome é obrigatório.',
  'Download template': 'Transferir modelo',
  'Choose an Excel or CSV file': 'Escolha um ficheiro Excel ou CSV',
  'or drop it here · .xlsx or .csv': 'ou largue-o aqui · .xlsx ou .csv',
  'Paste rows from a spreadsheet': 'Colar linhas de uma folha de cálculo',
  'Rows to import': 'Linhas a importar',
  'Copy the rows in Excel or Google Sheets, header row included, and paste them here': 'Copie as linhas no Excel ou no Google Sheets, incluindo a linha de cabeçalho, e cole-as aqui',
  'Use pasted rows': 'Usar linhas coladas',
  'Recognised columns': 'Colunas reconhecidas',
  'Ready': 'Pronto',
  'Joins squad': 'Entra no plantel',
  'Already added': 'Já existe',
  'Already in squad': 'Já está no plantel',
  'Repeated row': 'Linha repetida',
  'No name': 'Sem nome',
  'Ignore': 'Ignorar',
  'Row': 'Linha',
  'Result': 'Resultado',
  'Columns': 'Colunas',
  'Choose the column that holds the player’s name.': 'Escolha a coluna com o nome do jogador.',
  'Preview': 'Pré-visualização',
  'Choose another file': 'Escolher outro ficheiro',
  'This format can’t be read here. Save the file as .xlsx or .csv and try again.': 'Este formato não pode ser lido aqui. Guarde o ficheiro como .xlsx ou .csv e tente de novo.',
  'Choose an .xlsx or .csv file.': 'Escolha um ficheiro .xlsx ou .csv.',
  'The file could not be read. Check it is a valid .xlsx or .csv file.': 'Não foi possível ler o ficheiro. Confirme que é um ficheiro .xlsx ou .csv válido.',
  'No player rows found. The first row must hold the column names, with one player per row below it.': 'Não foram encontradas linhas de jogadores. A primeira linha deve ter os nomes das colunas, com um jogador por linha abaixo.',
  'Pasted rows': 'Linhas coladas',
  'Paste the rows first, header row included.': 'Cole primeiro as linhas, incluindo a linha de cabeçalho.',
  'Market value is financial information you cannot edit; it is not imported': 'O valor de mercado é informação financeira que não pode editar; não é importado',
  'new': 'novos',
  'existing, joining the squad': 'existentes, a entrar no plantel',
  'already in the database': 'já na base de dados',
  'already in the squad': 'já no plantel',
  'repeated rows': 'linhas repetidas',
  'without a name': 'sem nome',

  // Export
  'Closed on': 'Fechado em',
  'Created': 'Criado',
  'Updated': 'Atualizado',
  'Added': 'Adicionado',
  'Order': 'Ordem',
  'Minutes': 'Minutos',
  'Author': 'Autor',
  'Imported': 'Importada',
  'Team': 'Equipa',
  'Position group': 'Grupo de posições',
  'Still loading the data. Try again in a moment.': 'Os dados ainda estão a carregar. Tente de novo dentro de momentos.',
  'Downloads are not available in this view.': 'As transferências não estão disponíveis nesta vista.',
  'There is nothing you can export.': 'Não há nada que possa exportar.',
  'Export ready': 'Exportação pronta',
  'The export could not be downloaded here.': 'Não foi possível transferir a exportação aqui.',
  'Guide': 'Guia',

  // Toasts
  'Request deleted': 'Tarefa eliminada',
  'Request done': 'Tarefa concluída',
  'Request cancelled': 'Tarefa cancelada',
  'Request open': 'Tarefa reaberta',
  'Defaults restored in the form. Save to apply them.': 'Predefinições repostas no formulário. Guarde para as aplicar.',
  'Message copied': 'Mensagem copiada',
  'Copy did not work here. Select the text and copy it.': 'Não foi possível copiar aqui. Selecione o texto e copie-o.',
  'Invitation revoked': 'Convite revogado',
  'Request declined': 'Pedido recusado',
  'Could not send the request. Your access from the Share menu may be view-only.': 'Não foi possível enviar o pedido. O seu acesso no menu Share pode ser só de leitura.',
  'Removed from the squad': 'Retirado do plantel',
  'Need marked as open': 'Necessidade marcada como em aberto',
  'Need marked as in progress': 'Necessidade marcada como em curso',
  'Need marked as filled': 'Necessidade marcada como preenchida',
  'Need marked as cancelled': 'Necessidade marcada como cancelada',
  'Candidate removed': 'Candidato retirado',
  'Removed from list': 'Retirado da lista',
  'Shadow team renamed': 'Nome da equipa sombra alterado',
  'Shadow team created': 'Equipa sombra criada',
  'Shadow team deleted': 'Equipa sombra eliminada',
  'Note saved': 'Nota guardada',
  'Note updated': 'Nota atualizada',
  'Note deleted': 'Nota eliminada',
  'Player updated': 'Jogador atualizado',
  'This email already has an open invitation.': 'Este email já tem um convite em aberto.',
  'This person is already a member.': 'Esta pessoa já é membro.',
  'Access updated': 'Acesso atualizado',
  'Removed from the organization': 'Removido da organização',
  'Positions saved': 'Posições guardadas',
  'Player deleted': 'Jogador eliminado',
  'Report updated': 'Relatório atualizado',
  'Report deleted': 'Relatório eliminado',
  'Assignment updated': 'Tarefa atualizada',
  'Assignment created': 'Tarefa criada',
  'Evaluation criteria saved': 'Critérios de avaliação guardados',
  'Need updated': 'Necessidade atualizada',
  'Need created': 'Necessidade criada',
  'Need deleted': 'Necessidade eliminada',
  'Squad details saved': 'Dados do plantel guardados',

  // Import template (Guide sheet)
  'The name used day to day.': 'O nome usado no dia a dia.',
  'Full registered name.': 'Nome completo de registo.',
  'GK, RB, CB, LB, RWB, LWB, DM, CM, AM, RM, LM, RW, LW or ST. Portuguese names such as "Defesa central" also work.': 'GR, DD, DC, DE, ALD, ALE, MDC, MC, MO, MD, ME, ED, EE ou PL. Também funcionam os códigos em inglês (GK, CB, ST…) e nomes como "Defesa central".',
  'Position codes separated by commas, e.g. CM, AM.': 'Códigos de posição separados por vírgulas, ex.: MC, MO.',
  'A date, e.g. 25/03/2001.': 'Uma data, ex.: 25/03/2001.',
  'Country.': 'País.',
  'Centimetres, e.g. 184.': 'Centímetros, ex.: 184.',
  'Right, Left or Both.': 'Direito, Esquerdo ou Ambos.',
  'Current club. Leave empty for players in our squad.': 'Clube atual. Deixe vazio para jogadores do nosso plantel.',
  'League or competition.': 'Liga ou competição.',
  'A date, e.g. 30/06/2027.': 'Uma data, ex.: 30/06/2027.',
  'Agent or agency.': 'Agente ou agência.',
  'Free text, e.g. €2.5M.': 'Texto livre, ex.: 2,5 M€.',
  '1 to 99. Used when importing into the squad.': '1 a 99. Usado ao importar para o plantel.',
  'Available, Doubtful, Injured, Suspended or On loan. Used when importing into the squad.': 'Disponível, Em dúvida, Lesionado, Suspenso ou Emprestado. Usado ao importar para o plantel.',
  'Squad status': 'Estado no plantel',

  // Countries (nationalities are stored in English)
  'Albania': 'Albânia', 'Algeria': 'Argélia', 'Andorra': 'Andorra', 'Angola': 'Angola', 'Argentina': 'Argentina',
  'Armenia': 'Arménia', 'Australia': 'Austrália', 'Austria': 'Áustria', 'Azerbaijan': 'Azerbaijão', 'Belarus': 'Bielorrússia',
  'Belgium': 'Bélgica', 'Benin': 'Benim', 'Bolivia': 'Bolívia', 'Bosnia and Herzegovina': 'Bósnia e Herzegovina', 'Brazil': 'Brasil',
  'Bulgaria': 'Bulgária', 'Burkina Faso': 'Burkina Faso', 'Burundi': 'Burundi', 'Cameroon': 'Camarões', 'Canada': 'Canadá',
  'Cape Verde': 'Cabo Verde', 'Central African Republic': 'República Centro-Africana', 'Chad': 'Chade', 'Chile': 'Chile', 'China': 'China',
  'Colombia': 'Colômbia', 'Comoros': 'Comores', 'Congo': 'Congo', 'Costa Rica': 'Costa Rica', 'Croatia': 'Croácia',
  'Cuba': 'Cuba', 'Curaçao': 'Curaçau', 'Cyprus': 'Chipre', 'Czech Republic': 'Chéquia', 'Denmark': 'Dinamarca',
  'DR Congo': 'RD Congo', 'Dominican Republic': 'República Dominicana', 'Ecuador': 'Equador', 'Egypt': 'Egito', 'El Salvador': 'El Salvador',
  'England': 'Inglaterra', 'Equatorial Guinea': 'Guiné Equatorial', 'Estonia': 'Estónia', 'Ethiopia': 'Etiópia', 'Faroe Islands': 'Ilhas Faroé',
  'Finland': 'Finlândia', 'France': 'França', 'Gabon': 'Gabão', 'Gambia': 'Gâmbia', 'Georgia': 'Geórgia',
  'Germany': 'Alemanha', 'Ghana': 'Gana', 'Gibraltar': 'Gibraltar', 'Greece': 'Grécia', 'Guadeloupe': 'Guadalupe',
  'Guatemala': 'Guatemala', 'Guinea': 'Guiné', 'Guinea-Bissau': 'Guiné-Bissau', 'Haiti': 'Haiti', 'Honduras': 'Honduras',
  'Hungary': 'Hungria', 'Iceland': 'Islândia', 'India': 'Índia', 'Indonesia': 'Indonésia', 'Iran': 'Irão',
  'Iraq': 'Iraque', 'Israel': 'Israel', 'Italy': 'Itália', 'Ivory Coast': 'Costa do Marfim', 'Jamaica': 'Jamaica',
  'Japan': 'Japão', 'Jordan': 'Jordânia', 'Kazakhstan': 'Cazaquistão', 'Kenya': 'Quénia', 'Kosovo': 'Kosovo',
  'Kuwait': 'Koweit', 'Latvia': 'Letónia', 'Lebanon': 'Líbano', 'Liberia': 'Libéria', 'Libya': 'Líbia',
  'Liechtenstein': 'Listenstaine', 'Lithuania': 'Lituânia', 'Luxembourg': 'Luxemburgo', 'Madagascar': 'Madagáscar', 'Mali': 'Mali',
  'Malta': 'Malta', 'Martinique': 'Martinica', 'Mauritania': 'Mauritânia', 'Mexico': 'México', 'Moldova': 'Moldávia',
  'Montenegro': 'Montenegro', 'Morocco': 'Marrocos', 'Mozambique': 'Moçambique', 'Namibia': 'Namíbia', 'Netherlands': 'Países Baixos',
  'New Zealand': 'Nova Zelândia', 'Nicaragua': 'Nicarágua', 'Niger': 'Níger', 'Nigeria': 'Nigéria', 'North Macedonia': 'Macedónia do Norte',
  'Northern Ireland': 'Irlanda do Norte', 'Norway': 'Noruega', 'Panama': 'Panamá', 'Paraguay': 'Paraguai', 'Peru': 'Peru',
  'Poland': 'Polónia', 'Portugal': 'Portugal', 'Qatar': 'Catar', 'Republic of Ireland': 'República da Irlanda', 'Romania': 'Roménia',
  'Russia': 'Rússia', 'Rwanda': 'Ruanda', 'São Tomé and Príncipe': 'São Tomé e Príncipe', 'Saudi Arabia': 'Arábia Saudita', 'Scotland': 'Escócia',
  'Senegal': 'Senegal', 'Serbia': 'Sérvia', 'Sierra Leone': 'Serra Leoa', 'Slovakia': 'Eslováquia', 'Slovenia': 'Eslovénia',
  'South Africa': 'África do Sul', 'South Korea': 'Coreia do Sul', 'Spain': 'Espanha', 'Suriname': 'Suriname', 'Sweden': 'Suécia',
  'Switzerland': 'Suíça', 'Togo': 'Togo', 'Trinidad and Tobago': 'Trindade e Tobago', 'Tunisia': 'Tunísia', 'Turkey': 'Turquia',
  'Uganda': 'Uganda', 'Ukraine': 'Ucrânia', 'United Arab Emirates': 'Emirados Árabes Unidos', 'United States': 'Estados Unidos', 'Uruguay': 'Uruguai',
  'Uzbekistan': 'Usbequistão', 'Venezuela': 'Venezuela', 'Wales': 'País de Gales', 'Zambia': 'Zâmbia', 'Zimbabwe': 'Zimbabué',
};

const PT_PATTERNS = [
  [/^(\d+) players?$/, (m, t, pl) => `${m[1]} ${pl(m[1], 'jogador', 'jogadores')}`],
  [/^(\d+) of (\d+)$/, (m) => `${m[1]} de ${m[2]}`],
  [/^(\d+) notes?$/, (m, t, pl) => `${m[1]} ${pl(m[1], 'nota', 'notas')}`],
  [/^(\d+) this season$/, (m) => `${m[1]} esta época`],
  [/^(\d+) overdue$/, (m) => `${m[1]} em atraso`],
  [/^(\d+) high priority$/, (m) => `${m[1]} de prioridade alta`],
  [/^(\d+) open needs$/, (m) => `${m[1]} em aberto`],
  [/^(\d+) open$/, (m) => `${m[1]} em aberto`],
  [/^(\d+) active$/, (m, t, pl) => `${m[1]} ${pl(m[1], 'ativa', 'ativas')}`],
  [/^(\d+) full$/, (m, t, pl) => `${m[1]} ${pl(m[1], 'completo', 'completos')}`],
  [/^(\d+) y$/, (m) => `${m[1]} anos`],
  [/^(\d+) min$/, (m) => `${m[1]} min`],
  [/^(\d+) in list$/, (m) => `${m[1]} na lista`],
  [/^(\d+) left$/, (m, t, pl) => `${pl(m[1], 'falta', 'faltam')} ${m[1]}`],
  [/^\((\d+) reports?\)$/, (m, t, pl) => `(${m[1]} ${pl(m[1], 'relatório', 'relatórios')})`],
  [/^(\d+) waiting for approval$/, (m) => `${m[1]} a aguardar aprovação`],
  [/^(\d+) to (\d+) per group$/, (m) => `${m[1]}–${m[2]} por grupo`],
  [/^(\d+) of (\d+) positions covered$/, (m) => `${m[1]} de ${m[2]} posições preenchidas`],
  [/^(\d+) rows?(?: \(first (\d+) only\))?$/, (m, t, pl) => `${m[1]} ${pl(m[1], 'linha', 'linhas')}${m[2] ? ` (só as primeiras ${m[2]})` : ''}`],
  [/^(\d+) rows? with values to check$/, (m, t, pl) => `${m[1]} ${pl(m[1], 'linha', 'linhas')} com valores a verificar`],
  [/^Showing the first (\d+) of (\d+) rows\.$/, (m) => `A mostrar as primeiras ${m[1]} de ${m[2]} linhas.`],
  [/^Next 6 of (\d+)$/, (m) => `Próximas 6 de ${m[1]}`],
  [/^First 6 of (\d+)$/, (m) => `Primeiros 6 de ${m[1]}`],
  [/^Option (\d+)$/, (m) => `Opção ${m[1]}`],
  [/^Attribute (\d+)$/, (m) => `Atributo ${m[1]}`],
  [/^Strength (\d+)$/, (m) => `Ponto forte ${m[1]}`],
  [/^Concern (\d+)$/, (m) => `Preocupação ${m[1]}`],
  [/^Column (\d+)$/, (m) => `Coluna ${m[1]}`],
  [/^Field for column (\d+)$/, (m) => `Campo para a coluna ${m[1]}`],
  [/^Field for (.+)$/, (m) => `Campo para ${m[1]}`],
  [/^Player ([A-C])$/, (m) => `Jogador ${m[1]}`],
  [/^(High|Medium|Low) priority$/, (m) => `Prioridade ${{ High: 'alta', Medium: 'média', Low: 'baixa' }[m[1]]}`],
  [/^Workflow stage (\d+) of (\d+)$/, (m) => `Etapa ${m[1]} de ${m[2]} do processo`],
  [/^Our squad for the (.+) season\.$/, (m) => `O nosso plantel da época ${m[1]}.`],
  [/^Contracts ending by (.+)$/, (m) => `Contratos a terminar até ${m[1]}`],
  [/^contracts end by (.+)$/, (m) => `contratos terminam até ${m[1]}`],
  [/^No (\d{4}\/\d{2}) squad loaded$/, (m) => `Plantel ${m[1]} não carregado`],
  [/^No players in the (.+) squad yet$/, (m) => `Ainda não há jogadores no plantel ${m[1]}`],
  [/^(\d{4}\/\d{2}) squad by position group$/, (m) => `Plantel ${m[1]} por setor`],
  [/^Add the (.+) squad in First Team to see depth by position\.$/, (m) => `Adicione o plantel ${m[1]} em Equipa principal para ver a profundidade por posição.`],
  [/^Add to (?:the )?(\d{4}\/\d{2}) squad$/, (m) => `Adicionar ao plantel ${m[1]}`],
  [/^Add these players to the (.+) squad$/, (m) => `Adicionar estes jogadores ao plantel ${m[1]}`],
  [/^In the (.+) squad$/, (m) => `No plantel ${m[1]}`],
  [/^In (\d{4}\/\d{2}) squad$/, (m) => `No plantel ${m[1]}`],
  [/^Squad (\d{4}-\d{2})$/, (m) => `Plantel ${m[1]}`],
  [/^Added to the (.+) squad$/, (m) => `Adicionado ao plantel ${m[1]}`],
  [/^(.+) can still sign in, but will not see any data\.$/, (m) => `${m[1] === 'Their account' ? 'A conta' : m[1]} continua a poder iniciar sessão, mas deixa de ver os dados.`],
  [/^This email is confirmed and matches the invitation as (.+)\.$/, (m, t) => `Este email está confirmado e corresponde ao convite como ${t(m[1])}.`],
  [/^After this, send (.+) the invitation message\. They get in as soon as they create their account with this email and confirm it\.$/, (m) => `Depois disto, envie a mensagem do convite para ${m[1]}. A pessoa entra assim que criar a conta com este email e o confirmar.`],
  [/^Player already in the Player Database\? Open their profile and choose More actions › Add to (.+) squad\.$/, (m) => `O jogador já está na Base de dados de jogadores? Abra o perfil e escolha Mais ações › Adicionar ao plantel ${m[1]}.`],
  [/^Review on (.+)$/, (m) => `Rever em ${m[1]}`],
  [/^New need for (.+)$/, (m, t) => `Nova necessidade para ${t(m[1])}`],
  [/^Also plays (.+)$/, (m, t) => `Também joga a ${t(m[1])}`],
  [/^until (.+)$/, (m) => `até ${m[1]}`],
  [/^(.+) at this position$/, (m) => `${m[1]} nesta posição`],
  [/^(.+) at ([A-Z]{2,3})$/, (m, t) => `${m[1]} na posição ${t(m[2])}`],
  [/^Current (\d) · (.+?)(?: — Potential (\d) · (.+))?$/, (m, t) => `Atual ${m[1]} · ${t(m[2])}${m[3] ? ` — Potencial ${m[3]} · ${t(m[4])}` : ''}`],
  [/^played (.+)$/, (m, t) => `jogou a ${t(m[1])}`],
  [/^Potential: (.+)$/, (m, t) => `Potencial: ${t(m[1])}`],
  [/^Dimensions: (.+)$/, (m, t) => `Dimensões: ${t(m[1])}`],
  [/^(.+) — also (.+)$/, (m, t) => `${t(m[1])} — também ${t(m[2])}`],
  [/^(.+), (\d+) players?$/, (m, t, pl) => `${t(m[1])}, ${m[2]} ${pl(m[2], 'jogador', 'jogadores')}`],
  [/^Formation (.+)$/, (m) => `Sistema ${m[1]}`],
  [/^(.+) options in priority order$/, (m, t) => `Opções para ${t(m[1])} por ordem de prioridade`],
  [/^Members of (.+)$/, (m) => `Membros do ${m[1]}`],
  [/^People in (.+) and what each of them can do\.$/, (m) => `Pessoas do ${m[1]} e o que cada uma pode fazer.`],
  [/^· last active (.+)$/, (m) => `· última atividade ${m[1]}`],
  [/^Add “(.+)” as a new player$/, (m) => `Adicionar “${m[1]}” como novo jogador`],
  [/^New player: “(.+)”$/, (m) => `Novo jogador: “${m[1]}”`],
  [/^Remove (.+)\?$/, (m) => `Remover ${m[1]}?`],
  [/^Delete (.+)\?$/, (m) => `Eliminar ${m[1]}?`],
  [/^Remove (.+)$/, (m) => `Retirar ${m[1]}`],
  [/^To stop them opening the platform at all, also remove (.+) from the Share menu\.$/, (m) => `Para impedir que abra a plataforma, retire também ${m[1] === 'them' ? 'a pessoa' : m[1]} do menu Share.`],
  [/^claude\.ai confirms this email, and it matches the invitation as (.+)\.$/, (m, t) => `O claude.ai confirma este email, que corresponde ao convite como ${t(m[1])}.`],
  [/^(.+) defaults\. Open an area to adjust it for this person\.$/, (m, t) => `Predefinições de ${t(m[1])}. Abra uma área para a ajustar a esta pessoa.`],
  [/^After this, share the platform with (.+) from the Share menu, as (.+)\. They get in once they request access and you activate it\.$/, (m) => `Depois disto, partilhe a plataforma com ${m[1]} no menu Share, como ${m[2]}. A pessoa entra quando pedir acesso e o proprietário o ativar.`],
  [/^(.+) will let you in once your access is activated\. This page updates by itself\.$/, (m) => `O ${m[1]} dá-lhe entrada quando o seu acesso for ativado. Esta página atualiza-se sozinha.`],
  [/^Ask the Owner of (.+) to reactivate it\.$/, (m) => `Peça ao proprietário do ${m[1]} que o reative.`],
  [/^You don’t have access to (.+) yet$/, (m) => `Ainda não tem acesso ao ${m[1]}`],
  [/^Moved to (.+)$/, (m, t) => `Movido para ${t(m[1])}`],
  [/^Number (\d+) is already worn by (.+)\.$/, (m) => `O número ${m[1]} já é usado por ${m[2] === 'another player' ? 'outro jogador' : m[2]}.`],
  [/^(.+) is already a candidate for every active need\.$/, (m) => `${m[1]} já é candidato em todas as necessidades ativas.`],
  [/^Each recruitment need keeps its own shortlist: its candidates\. (.+)’s internal status becomes Shortlisted\.$/, (m) => `Cada necessidade de recrutamento tem a sua shortlist: os seus candidatos. O estado interno de ${m[1]} passa a Na shortlist.`],
  [/^This step is done by someone with permission to (add players to shortlists|plan assignments|edit players)\. Your report is saved\.$/, (m) => `Este passo é feito por alguém com permissão para ${{ 'add players to shortlists': 'adicionar jogadores às shortlists', 'plan assignments': 'planear tarefas', 'edit players': 'editar jogadores' }[m[1]]}. O seu relatório ficou guardado.`],
  [/^and add (.+) as a candidate\.$/, (m) => `e adicione ${m[1]} como candidato.`],
  [/^(.+) joins the need’s candidates, which act as its shortlist, and his internal status becomes Shortlisted\.$/, (m) => `${m[1]} entra nos candidatos da necessidade, que são a sua shortlist, e o estado interno passa a Na shortlist.`],
  [/^Creates an assignment for you to watch (.+) again, in Scouting › Assignments\.$/, (m) => `Cria uma tarefa para voltar a observar ${m[1]}, em Scouting › Tarefas.`],
  [/^(.+)’s internal status becomes Monitoring, with a date to review him again\.$/, (m) => `O estado interno de ${m[1]} passa a Em acompanhamento, com uma data para voltar a rever.`],
  [/^(.+) is marked as not for us \((.+)\)\.(?: He is also removed from the candidates for (.+)\.)? You can reopen him from his profile\.$/, (m, t) => `${m[1]} fica marcado como não interessa (${t(m[2]).toLowerCase()}).${m[3] ? ` Sai também dos candidatos de ${t(m[3])}.` : ''} Pode reabri-lo no perfil.`],
  [/^(.+)\. This cannot be undone\.$/, (m, t) => `${t(m[1])}. Esta ação não pode ser anulada.`],
  [/^(.+)\. Its candidate list is removed; the players stay in the Player Database\.$/, (m, t) => `${t(m[1])}. A lista de candidatos é removida; os jogadores ficam na Base de dados de jogadores.`],
  [/^Date “(.+)” not recognised$/, (m) => `Data “${m[1]}” não reconhecida`],
  [/^Date of birth “(.+)” out of range$/, (m) => `Data de nascimento “${m[1]}” fora do intervalo`],
  [/^Height “(.+)” not recognised$/, (m) => `Altura “${m[1]}” não reconhecida`],
  [/^Height “(.+)” out of range$/, (m) => `Altura “${m[1]}” fora do intervalo`],
  [/^Position “(.+)” not recognised$/, (m) => `Posição “${m[1]}” não reconhecida`],
  [/^Foot “(.+)” not recognised$/, (m) => `Pé “${m[1]}” não reconhecido`],
  [/^Squad status “(.+)” not recognised$/, (m) => `Estado no plantel “${m[1]}” não reconhecido`],
  [/^Shirt number “(.+)” not recognised$/, (m) => `Número da camisola “${m[1]}” não reconhecido`],
  [/^Shirt number (\d+) is already taken; it will be left empty$/, (m) => `O número ${m[1]} já está ocupado; fica vazio`],
  [/^(.+)\. Portuguese names such as Nome, Posição, Data de nascimento, Clube or Número also work\.$/, (m, t) => `${t(m[1])}. Também funcionam os nomes em inglês, como Name, Position, Date of birth, Club ou Shirt number.`],
  [/^Importing (\d+) of (\d+)…$/, (m) => `A importar ${m[1]} de ${m[2]}…`],
  [/^Import (\d+) players?$/, (m, t, pl) => `Importar ${m[1]} ${pl(m[1], 'jogador', 'jogadores')}`],
  [/^Imported (\d+) of (\d+)\. The rest could not be saved\.$/, (m) => `Importados ${m[1]} de ${m[2]}. Não foi possível guardar os restantes.`],
  [/^(\d+) players? imported(?: · (\d+) added to the squad)?$/, (m, t, pl) => `${m[1]} ${pl(m[1], 'jogador importado', 'jogadores importados')}${m[2] ? ` · ${m[2]} ${pl(m[2], 'adicionado', 'adicionados')} ao plantel` : ''}`],
  [/^(.+) arrives with the (.+) module\.$/, (m, t) => `${t(m[1])} chega com o módulo ${t(m[2])}.`],
  [/^(.+) reopened$/, (m) => `${m[1]} reaberto`],
  [/^Up to (\d+) attributes per position group\.$/, (m) => `Até ${m[1]} atributos por grupo de posições.`],
  [/^(.+) needs (\d+) to (\d+) attributes\.$/, (m, t) => `${t(m[1])} precisa de ${m[2]} a ${m[3]} atributos.`],
  [/^(.+) added as a candidate$/, (m) => `${m[1] === 'Player' ? 'Jogador' : m[1]} adicionado como candidato`],
  [/^(.+) can now use the platform$/, (m) => `${m[1]} já pode usar a plataforma`],
  [/^(.+) added to the squad$/, (m) => `${m[1]} adicionado ao plantel`],
  [/^(.+) shortlisted for (.+)$/, (m, t) => `${m[1]} adicionado à shortlist de ${t(m[2])}`],
  [/^Shortlisted for (.+)$/, (m, t) => `Na shortlist de ${t(m[1])}`],
  [/^Assignment created for (.+)$/, (m) => `Tarefa criada para ${m[1]}`],
  [/^(.+) added to the watchlist$/, (m) => `${m[1]} em acompanhamento`],
  [/^(.+) closed as not for us$/, (m) => `${m[1]} marcado como não interessa`],
  [/^Added to (.+)$/, (m, t) => `Adicionado a ${t(m[1])}`],
  [/^(.+) added$/, (m) => `${m[1]} adicionado`],
  [/^(.+) \(you\)$/, (m) => `${m[1]} (você)`],
];

// Status chips and a few controls use the same English word with a different Portuguese form.
const PT_CONTEXT = [
  ['.status', { 'Done': 'Concluída', 'Active': 'Ativo' }],
  ['[data-action="needs-scope"], [data-action="requests-scope"]', { 'All': 'Todas' }],
  ['.sb-nav', { 'Player Database': 'Base de dados', 'Recruitment Needs': 'Necessidades' }],
  ['.track', { 'Untracked': 'Sem acomp.', 'Monitoring': 'Em acomp.', 'Shortlisted': 'Shortlist' }],
  ['.dash-depth', { 'Ending': 'Fim', 'Need': 'Estado' }],
  ['.depth-table', { 'Players': 'Jog.', 'Ending': 'Fim', 'Avg age': 'Id. média', 'Needs': 'Em aberto' }],
];
const PT_CONTEXT_KEYS = new Set(PT_CONTEXT.flatMap(([, m]) => Object.keys(m)));
const PT_STATUS = PT_CONTEXT[0][1];

const LANGUAGES = [
  { id: 'pt', short: 'PT', name: 'Português (Portugal)', html: 'pt-PT', title: 'Plataforma de Scouting e Recrutamento' },
  { id: 'en', short: 'EN', name: 'English', html: 'en', title: 'Scouting & Recruitment Platform' },
];
const LANGUAGE = Object.fromEntries(LANGUAGES.map((l) => [l.id, l]));
// Each person's choice, kept in this browser. Without one, the browser's language decides.
let LANG = (() => {
  let saved = null;
  try { saved = localStorage.getItem('lang'); } catch (e) { saved = null; }
  if (LANGUAGE[saved]) return saved;
  return /^pt\b/i.test(navigator.language || '') ? 'pt' : 'en';
})();

const PT_MAP = new Map(Object.entries(PT_TEXT));
const plural = (n, one, many) => (Number(n) === 1 ? one : many);
// One piece of text: the dictionary first, then the patterns for text built from data.
function ptPiece(s) {
  const hit = PT_MAP.get(s);
  if (hit !== undefined) return hit;
  for (const [re, fn] of PT_PATTERNS) {
    const m = re.exec(s);
    if (m) return fn(m, ptValue, plural);
  }
  return null;
}
// A value inside a sentence (a position, a status, a list of them). Names and other data stay as they are.
function ptValue(s) {
  const v = String(s);
  const whole = ptPiece(v);
  if (whole !== null) return whole;
  for (const sep of [' · ', ', ', '; ']) {
    if (!v.includes(sep)) continue;
    const parts = v.split(sep).map((p) => { const t = ptPiece(p.trim()); return t === null ? p : t; });
    const out = parts.join(sep);
    if (out !== v) return out;
  }
  return v;
}
// A list ("CM, AM", "Technical, Tactical") is translated only when every item is known.
function ptList(s) {
  for (const sep of [', ', '; ']) {
    if (!s.includes(sep)) continue;
    const parts = s.split(sep).map((p) => ptPiece(p.trim()));
    if (parts.every((p) => p !== null)) return parts.join(sep);
  }
  return null;
}
// A whole text: exact text, patterns, lists, then " · " segments.
function ptText(s) {
  const whole = ptPiece(s);
  if (whole !== null) return whole;
  const list = ptList(s);
  if (list !== null) return list;
  if (s.includes(' · ')) {
    const out = s.split(' · ').map((p) => { const c = p.trim(); const t = ptPiece(c) ?? ptList(c); return t === null ? p : p.replace(c, t); }).join(' · ');
    if (out !== s) return out;
  }
  return null;
}
/** Text in the current language. The interface is written in English; Portuguese is applied here. */
function tr(text, context = '') {
  if (LANG !== 'pt' || text === null || text === undefined) return text;
  const str = String(text);
  const core = str.trim();
  if (!core) return str;
  if (/^\d+\.\d+$/.test(core)) return str.replace(core, core.replace('.', ','));   // 24.5 → 24,5
  if (!/[A-Za-z]/.test(core)) return str;
  const ctx = context === 'status' && PT_STATUS[core];
  const out = ctx || ptText(core);
  return out === null ? str : str.slice(0, str.indexOf(core)) + out + str.slice(str.indexOf(core) + core.length);
}
// Portuguese of a label, whatever the current language (used in Portuguese-only text such as invitations).
const inPortuguese = (label) => { const v = PT_MAP.get(label); return v === undefined ? label : v; };
// Values typed in Portuguese are stored in English when they belong to a vocabulary (countries, attributes).
function fromPortuguese(value, vocabulary) {
  const key = normText(String(value || '').trim());
  if (!key) return String(value || '').trim();
  const hit = vocabulary.find((en) => normText(en) === key || normText(inPortuguese(en)) === key);
  return hit || String(value).trim();
}

/* Everything the page renders passes through here: text, titles, placeholders and labels.
   Saved data never changes with the language. */
const I18N_ATTRS = ['title', 'placeholder', 'aria-label'];
const I18N_SKIP = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'svg']);
const skipsTranslation = (el) => I18N_SKIP.has(el.tagName) || el.getAttribute('translate') === 'no';
function translateText(node) {
  const v = node.nodeValue;
  if (!v || !/[A-Za-z]|^\s*\d+\.\d+\s*$/.test(v)) return;
  const parent = node.parentElement;
  if (!parent || parent.closest('textarea, [translate="no"], .avatar, .pp-initials')) return;
  const core = v.trim();
  let out;
  if (PT_CONTEXT_KEYS.has(core)) {
    const rule = PT_CONTEXT.find(([sel, map]) => map[core] && parent.closest(sel));
    out = rule ? v.replace(core, rule[1][core]) : tr(v);
  } else out = tr(v);
  if (out !== v) node.nodeValue = out;
}
function translateAttrs(el) {
  for (const a of I18N_ATTRS) {
    const v = el.getAttribute(a);
    if (!v) continue;
    const out = tr(v);
    if (out !== v) el.setAttribute(a, out);
  }
}
function translateTree(root) {
  if (LANG !== 'pt' || !root) return;
  if (root.nodeType === 3) { translateText(root); return; }
  if (root.nodeType !== 1 || skipsTranslation(root) || root.closest('[translate="no"]')) return;
  translateAttrs(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode: (n) => (n.nodeType === 1 && skipsTranslation(n) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
  });
  let n;
  while ((n = walker.nextNode())) { if (n.nodeType === 3) translateText(n); else translateAttrs(n); }
}
const translator = new MutationObserver((records) => {
  if (LANG !== 'pt') return;
  records.forEach((r) => {
    if (r.type === 'childList') r.addedNodes.forEach(translateTree);
    else if (r.type === 'characterData') translateText(r.target);
    else if (r.target.nodeType === 1) translateAttrs(r.target);
  });
});
translator.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: I18N_ATTRS });

function applyLanguage() {
  document.documentElement.lang = LANGUAGE[LANG].html;
  document.title = LANGUAGE[LANG].title;
  const sb = document.getElementById('sidebar');
  if (sb) sb.setAttribute('aria-label', 'Main navigation');
  translateTree(document.body);
}
applyLanguage();

const THEMES = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'premium', label: 'Premium' },
];
let THEME = (() => {
  let saved = null;
  try { saved = localStorage.getItem('theme'); } catch (e) { saved = null; }
  return THEMES.some((t) => t.id === saved) ? saved : 'light';
})();
function applyTheme() {
  if (THEME === 'light') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', THEME);
}
applyTheme();

/* ---------------------------------------------------------------------
   3. DATA LAYER
   The UI reads through these objects only. Sources (external APIs,
   providers, manual entry, internal scouting, file imports) plug in
   behind them without touching any view.
   --------------------------------------------------------------------- */

const DataSources = {
  // Manual entry is the only source for now. APIs, providers and file imports plug in here later.
  connected: [{ id: 'manual', kind: 'manual', name: 'Manual entry' }],
  any() { return this.connected.length > 0; },
};

// One shared handle to the page's database; null when this view has none.
const dbHandle = (async () => {
  try {
    return (window.claude && typeof window.claude.use === 'function') ? await window.claude.use('db') : null;
  } catch (err) { return null; }
})();

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
function deepMerge(base, patch) {
  const out = { ...base };
  Object.entries(patch).forEach(([k, v]) => { out[k] = isPlainObject(v) && isPlainObject(out[k]) ? deepMerge(out[k], v) : v; });
  return out;
}

/**
 * A live collection of documents. Saved in the page's shared database when
 * the viewer provides one; otherwise kept in memory for this visit only
 * (status 'memory'). Views read `list()` / `get()` and re-render on change.
 */
function createStore(path, { prefix, normalize, compare }) {
  let status = 'idle';           // 'idle' (not started: no access) | 'connecting' | 'saved' | 'memory'
  let items = [];
  let col = null;
  const listeners = new Set();
  const queues = new Map();      // one write at a time per document
  const emit = () => listeners.forEach((fn) => { try { fn(); } catch (err) { console.error(err); } });
  const now = () => new Date().toISOString();
  const newId = () => prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const toItem = (id, d) => ({ ...normalize(d || {}), id });
  const sorted = (arr) => (compare ? arr.slice().sort(compare) : arr);
  const clean = (o) => JSON.parse(JSON.stringify(o));   // drops undefined values
  const useMemory = () => { col = null; status = 'memory'; emit(); };

  // A store connects only when start() is called, after the viewer's access is known,
  // so a collection the viewer may not use is never requested.
  let started = false;
  let markReady;
  const ready = new Promise((resolve) => { markReady = resolve; });
  const connect = async () => {
    const db = await dbHandle;
    if (!db) return useMemory();
    let ref;
    try { ref = db.collection(path); } catch (err) { return useMemory(); }
    await new Promise((resolve) => {
      let settled = false;
      const settle = () => { if (!settled) { settled = true; resolve(); } };
      const timer = setTimeout(() => { if (status === 'connecting') useMemory(); settle(); }, 9000);
      ref.onSnapshot((snap) => {
        if (status === 'memory') return;   // gave up waiting; stay in memory
        col = ref;
        items = sorted(snap.docs.filter((d) => d.exists).map((d) => toItem(d.id, d.data())));
        status = 'saved';
        clearTimeout(timer);
        emit();
        settle();
      }, () => { clearTimeout(timer); if (status !== 'memory') useMemory(); settle(); });
    });
  };
  function start() {
    if (started) return ready;
    started = true;
    status = 'connecting';
    connect().then(markReady, markReady);
    return ready;
  }
  const guard = () => { if (!started) throw new Error('not_permitted'); };

  const enqueue = (id, fn) => {
    const next = (queues.get(id) || Promise.resolve()).catch(() => {}).then(fn);
    queues.set(id, next);
    return next;
  };

  async function set(id, body) {
    guard();
    await ready;
    const doc = clean({ ...body, updatedAt: now() });
    if (status === 'saved' && col) { await enqueue(id, () => col.doc(id).set(doc)); return id; }
    const item = toItem(id, doc);
    items = sorted(items.some((i) => i.id === id) ? items.map((i) => (i.id === id ? item : i)) : [...items, item]);
    emit();
    return id;
  }
  async function update(id, patch) {
    guard();
    await ready;
    const body = clean({ ...patch, updatedAt: now() });
    if (status === 'saved' && col) return enqueue(id, () => col.doc(id).update(body));
    items = sorted(items.map((i) => (i.id === id ? toItem(id, deepMerge(i, body)) : i)));
    emit();
  }
  async function remove(id) {
    guard();
    await ready;
    if (status === 'saved' && col) return enqueue(id, () => col.doc(id).delete());
    items = items.filter((i) => i.id !== id);
    emit();
  }

  return {
    path,
    ready,
    start,
    started: () => started,
    status: () => status,
    list: () => items,
    get: (id) => (id && items.find((i) => i.id === id)) || null,
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    set,
    create: (body) => set(newId(), { ...body, createdAt: now() }),
    update,
    remove,
  };
}

/**
 * Player: the shape every source is normalised to. Only `name` is required;
 * a missing value renders as "—" and is never treated as zero.
 * { id, name, fullName, birthDate (YYYY-MM-DD), heightCm, foot, nationality,
 *   secondNationality, position, secondaryPositions[], club, competition,
 *   squadRole, availability, internalStatus,
 *   contract: { current, endDate, option, club, agent, marketValue, askingPrice, salary, loan, notes } }
 */
const PlayerStore = createStore('players', {
  prefix: 'p-',
  normalize: (d) => ({
    ...d,
    name: String(d.name || 'Unnamed player'),
    secondaryPositions: Array.isArray(d.secondaryPositions) ? d.secondaryPositions.filter((x) => PLAYER_POSITION[x]) : [],
    contract: isPlainObject(d.contract) ? { ...d.contract } : {},
  }),
  compare: (a, b) => a.name.localeCompare(b.name),
});

/** Our squad for the season. One document per player, keyed by the player id. */
const SquadStore = createStore(`squads/${SEASON.id}/members`, {
  prefix: 'm-',
  normalize: (d) => {
    const n = d.shirtNumber === null || d.shirtNumber === undefined || d.shirtNumber === '' ? NaN : Number(d.shirtNumber);
    return {
      playerId: String(d.playerId || ''),
      shirtNumber: Number.isFinite(n) ? n : null,
      status: VOCAB.squadStatus[d.status] ? d.status : 'available',
      addedAt: d.addedAt || '',
    };
  },
});

/**
 * Shadow teams: parallel squads of external options.
 * Team: { id, name, formation, entries: [{ playerId, positionId, note, addedAt }], createdAt, updatedAt }
 * Within a position, the order of its entries is the priority.
 */
const validEntry = (e) => e && typeof e.playerId === 'string' && typeof e.positionId === 'string';
const ShadowTeamStore = createStore('shadowTeams', {
  prefix: 'st-',
  normalize: (d) => ({
    name: String(d.name || 'Untitled'),
    formation: FORMATIONS[d.formation] ? d.formation : DEFAULT_FORMATION,
    entries: Array.isArray(d.entries) ? d.entries.filter(validEntry).map((e) => ({ ...e })) : [],
    createdAt: d.createdAt || '',
    updatedAt: d.updatedAt || '',
  }),
  compare: (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)),
});

/**
 * Recruitment needs for the season. Candidates keep the order they were added.
 * Need: { id, season, position, profile, priority, window, status, reasons[], dealType,
 *         ageMin, ageMax, relatedPlayerId, notes, candidates: [{ playerId, addedAt }], createdAt, updatedAt }
 */
const numOrNull = (v) => (v === null || v === undefined || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
const NeedStore = createStore('needs', {
  prefix: 'n-',
  normalize: (d) => ({
    season: d.season || SEASON.id,
    position: PLAYER_POSITION[d.position] ? d.position : '',
    profile: String(d.profile || ''),
    priority: PRIORITY_ORDER[d.priority] !== undefined ? d.priority : 'medium',
    window: NEED_WINDOW[d.window] ? d.window : 'summer-2027',
    status: VOCAB.needStatus[d.status] ? d.status : 'open',
    reasons: Array.isArray(d.reasons) ? d.reasons.filter((r) => NEED_REASON[r]) : [],
    dealType: DEAL_TYPES[d.dealType] ? d.dealType : 'any',
    ageMin: numOrNull(d.ageMin),
    ageMax: numOrNull(d.ageMax),
    relatedPlayerId: String(d.relatedPlayerId || ''),
    notes: String(d.notes || ''),
    candidates: Array.isArray(d.candidates) ? d.candidates.filter((c) => c && typeof c.playerId === 'string').map((c) => ({ ...c })) : [],
    createdAt: d.createdAt || '',
    updatedAt: d.updatedAt || '',
  }),
  compare: (a, b) => String(a.createdAt).localeCompare(String(b.createdAt)),
});

/**
 * Scouting reports (specification v1.0). Newest first.
 * Report: { id, playerId, needId, type: 'quick'|'full', date, scout, venue, match, competition,
 *           positionPlayed, minutes, levelNow, levelPotential, recommendation, closeReason, summary,
 *           dimensions: { technical, tactical, physical, mental }, attributes: [{ name, score }],
 *           strengths[], concerns[], createdAt, updatedAt }
 */
const clampOrNull = (v, lo, hi) => { const n = numOrNull(v); return n !== null && n >= lo && n <= hi ? Math.round(n) : null; };
const strList = (a) => (Array.isArray(a) ? a.map((x) => String(x || '').trim()).filter(Boolean).slice(0, 3) : []);
const ReportStore = createStore('reports', {
  prefix: 'r-',
  normalize: (d) => ({
    playerId: String(d.playerId || ''),
    needId: String(d.needId || ''),
    type: d.type === 'full' ? 'full' : 'quick',
    date: String(d.date || ''),
    authorId: String(d.authorId || ''),   // claude.ai user id; '' on reports from before multi-user access (the Owner's)
    scout: String(d.scout || ''),         // name only on those older reports
    venue: VENUES[d.venue] ? d.venue : 'live',
    match: String(d.match || ''),
    competition: String(d.competition || ''),
    positionPlayed: PLAYER_POSITION[d.positionPlayed] ? d.positionPlayed : '',
    minutes: clampOrNull(d.minutes, 0, 150),
    levelNow: clampOrNull(d.levelNow, 1, 5),
    levelPotential: clampOrNull(d.levelPotential, 1, 5),
    recommendation: RECOMMENDATION[d.recommendation] ? d.recommendation : 'monitor',
    closeReason: CLOSE_REASONS[d.closeReason] ? d.closeReason : '',
    summary: String(d.summary || ''),
    dimensions: Object.fromEntries(DIMENSIONS.map((x) => [x.id, clampOrNull(isPlainObject(d.dimensions) ? d.dimensions[x.id] : null, 1, 4)])),
    attributes: Array.isArray(d.attributes) ? d.attributes.filter((a) => a && a.name).map((a) => ({ name: String(a.name), score: clampOrNull(a.score, 1, 4) })).filter((a) => a.score !== null) : [],
    strengths: strList(d.strengths),
    concerns: strList(d.concerns),
    createdAt: d.createdAt || '',
    updatedAt: d.updatedAt || '',
  }),
  compare: (a, b) => (b.date || '').localeCompare(a.date || '') || String(b.createdAt).localeCompare(String(a.createdAt)),
});

/** Assignments (observation requests), shown in Scouting › Assignments. Open first, then by due date. */
const REQUEST_ORDER = { open: 0, done: 1, cancelled: 2 };
const RequestStore = createStore('observationRequests', {
  prefix: 'o-',
  normalize: (d) => ({
    playerId: String(d.playerId || ''),
    needId: String(d.needId || ''),
    assigneeId: String(d.assigneeId || ''),   // who watches; '' on older entries (the Owner's)
    createdBy: String(d.createdBy || ''),
    scout: String(d.scout || ''),
    match: String(d.match || ''),
    dueBy: String(d.dueBy || ''),
    note: String(d.note || ''),
    status: VOCAB.requestStatus[d.status] ? d.status : 'open',
    reportId: String(d.reportId || ''),
    doneReportId: String(d.doneReportId || ''),
    createdAt: d.createdAt || '',
    updatedAt: d.updatedAt || '',
  }),
  compare: (a, b) => (REQUEST_ORDER[a.status] - REQUEST_ORDER[b.status]) || (a.dueBy || '9999').localeCompare(b.dueBy || '9999') || String(a.createdAt).localeCompare(String(b.createdAt)),
});

/** Department settings. Document 'evaluation' holds the attributes per position group. */
const SettingsStore = createStore('settings', { prefix: 's-', normalize: (d) => ({ ...d }) });
function evaluationAttributes() {
  const saved = SettingsStore.get('evaluation');
  const stored = saved && isPlainObject(saved.attributes) ? saved.attributes : {};
  return Object.fromEntries(ATTRIBUTE_GROUPS.map((g) => {
    const list = Array.isArray(stored[g.id]) ? stored[g.id].map((x) => String(x || '').trim()).filter(Boolean).slice(0, MAX_ATTRIBUTES) : null;
    return [g.id, list && list.length ? list : DEFAULT_ATTRIBUTES[g.id]];
  }));
}
const attributesFor = (pos) => (ATTRIBUTE_GROUP_OF[pos] ? evaluationAttributes()[ATTRIBUTE_GROUP_OF[pos]] : []);

/**
 * Note on a player: { id, playerId, text, category, author, createdAt, updatedAt }. Newest first.
 * Only people who can open the platform read them; in the single-user phase, only its owner.
 */
const NOTE_CATEGORY_IDS = NOTE_CATEGORIES.map((c) => c.toLowerCase());
const NoteStore = createStore('notes', {
  prefix: 'nt-',
  normalize: (d) => ({
    playerId: String(d.playerId || ''),
    text: String(d.text || ''),
    category: NOTE_CATEGORY_IDS.includes(d.category) ? d.category : 'general',
    author: String(d.author || ''),
    authorId: String(d.authorId || ''),
    imported: !!d.imported,          // brought in from another system; createdAt holds the original date only
    createdAt: d.createdAt || '',
    updatedAt: d.updatedAt || '',
  }),
  compare: (a, b) => String(b.createdAt).localeCompare(String(a.createdAt)),
});
const notesFor = (playerId) => NoteStore.list().filter((n) => n.playerId === playerId);

/* -- Organization, members and access -- */
/** A member of the organization, keyed by their claude.ai user id:
 * { userId, role, overrides: { permission: true|false }, status, email, inviteId, joinedAt }.
 * Everyone in the organization reads members (to know their own role); only the Owner writes them. */
const MemberStore = createStore('members', {
  prefix: 'm-',
  normalize: (d) => ({
    userId: String(d.userId || ''),
    role: INVITABLE_ROLES.includes(d.role) ? d.role : 'scout',
    overrides: isPlainObject(d.overrides) ? Object.fromEntries(Object.entries(d.overrides).filter(([k]) => PERMISSION[k]).map(([k, v]) => [k, !!v])) : {},
    status: d.status === 'suspended' ? 'suspended' : 'active',
    email: String(d.email || ''),
    inviteId: String(d.inviteId || ''),
    joinedAt: d.joinedAt || '',
    updatedAt: d.updatedAt || '',
  }),
  compare: (a, b) => String(a.joinedAt).localeCompare(String(b.joinedAt)),
});
/** An invitation: { email, role, overrides, status: 'pending'|'accepted', invitedAt, invitedBy, userId }. Owner only on the server. */
const InviteStore = createStore('invites', {
  prefix: 'inv-',
  normalize: (d) => ({
    email: String(d.email || '').trim().toLowerCase(),
    role: INVITABLE_ROLES.includes(d.role) ? d.role : 'scout',
    overrides: isPlainObject(d.overrides) ? Object.fromEntries(Object.entries(d.overrides).filter(([k]) => PERMISSION[k]).map(([k, v]) => [k, !!v])) : {},
    status: d.status === 'accepted' ? 'accepted' : 'pending',
    invitedAt: d.invitedAt || '',
    invitedBy: String(d.invitedBy || ''),
    userId: String(d.userId || ''),
  }),
  compare: (a, b) => String(b.invitedAt).localeCompare(String(a.invitedAt)),
});
/** A request to enter, written by someone who opened the platform and is not a member yet.
 * Document id = their user id; each person reads only their own, the Owner reads all. */
const JoinRequestStore = createStore('joinRequests', {
  prefix: 'jr-',
  normalize: (d) => ({ email: String(d.email || ''), requestedAt: d.requestedAt || '' }),
  compare: (a, b) => String(a.requestedAt).localeCompare(String(b.requestedAt)),
});
/** Last activity, one document per person (id = user id). Each person writes their own; the Owner reads all. */
const PresenceStore = createStore('presence', { prefix: 'pr-', normalize: (d) => ({ lastActive: d.lastActive || '', level: String(d.level || '') }) });
/** The organization record, org/main: { name, ownerId, createdAt }. Only the Owner writes it. */
const OrgStore = createStore('org', {
  prefix: 'o-',
  normalize: (d) => ({ name: String(d.name || ORG.name), ownerId: String(d.ownerId || ''), createdAt: d.createdAt || '' }),
});
/** Financial information per player, kept apart from the player record: finance/<playerId>.
 * Owner only on the server in this setup (see DB_RULES). */
const FINANCE_FIELDS = [
  ['marketValue', 'Market value', 'financial.viewMarket'],
  ['askingPrice', 'Asking price', 'financial.viewAsking'],
  ['salary', 'Salary', 'financial.viewSalary'],
  ['transferCost', 'Transfer cost', 'financial.viewTransfer'],
  ['notes', 'Financial notes', 'financial.viewNotes'],
];
const FinanceStore = createStore('finance', {
  prefix: 'f-',
  normalize: (d) => Object.fromEntries(FINANCE_FIELDS.map(([k]) => [k, String(d[k] || '')])),
});

const STORES = [PlayerStore, SquadStore, ShadowTeamStore, NeedStore, ReportStore, RequestStore, SettingsStore, NoteStore,
  MemberStore, InviteStore, JoinRequestStore, PresenceStore, OrgStore, FinanceStore];
const anyUnsaved = () => STORES.some((s) => s.status() === 'memory');

/**
 * Prototype record of the server rules. The hosted platform enforces roles and permissions in the
 * database itself: see supabase/migrations (row level security on public.docs).
 */
const DB_RULES = [
  { path: '', read: 'interact', write: 'interact' },
  { path: 'finance', read: 'owner', write: 'owner' },
  { path: 'recruitment', read: 'owner', write: 'owner' },
  { path: 'members', read: 'interact', write: 'owner' },
  { path: 'invites', read: 'owner', write: 'owner' },
  { path: 'org', read: 'interact', write: 'owner' },
  { path: 'joinRequests', read: 'owner', write: 'owner' },
  { path: 'joinRequests/{self}', read: 'interact', write: 'interact' },
  { path: 'presence', read: 'owner', write: 'owner' },
  { path: 'presence/{self}', read: 'interact', write: 'interact' },
];

// Who is using the platform now, as the sign-in service reports it.
const Viewer = { id: null, name: '', email: null, isOwner: false, level: null, local: false };
// What they may do. state: 'checking' | 'ready' | 'none' (not a member) | 'pending' (asked to join) | 'suspended' | 'unknown'
const Access = { state: 'checking', role: null, perms: new Set() };
const can = (key) => Access.perms.has(key);
const canAny = (...keys) => keys.some(can);
const ownerId = () => (OrgStore.get('main') || {}).ownerId || (Viewer.isOwner ? Viewer.id || '' : '');
// Records without an author predate multi-user access and belong to the Owner.
const isMine = (userId) => (userId ? userId === Viewer.id : Viewer.isOwner);
const activeMembers = () => MemberStore.list().filter((m) => m.status === 'active');
const showAuthors = () => activeMembers().length > 0;
const roleLabel = (roleId) => (ROLES[roleId] ? ROLES[roleId].label : '');

// Display names come from the platform for each id and are never stored (names change, ids do not).
const People = {
  ns: null, cache: {}, pending: new Set(), timer: null,
  get(id) { if (!id) return null; if (!this.cache[id]) this.want(id); return this.cache[id] || null; },
  want(id) {
    if (!this.ns || this.pending.has(id)) return;
    this.pending.add(id);
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.flush(), 0);
  },
  async flush() {
    const ids = [...this.pending];
    if (!ids.length || !this.ns) return;
    try { Object.assign(this.cache, await this.ns.profiles(ids)); } catch (e) { /* names stay unresolved */ }
    queueRefresh();
  },
};
function personName(id, fallback = 'Someone') {
  if (!id) return fallback;
  if (id === Viewer.id && Viewer.name) return Viewer.name;
  const p = People.get(id);
  if (p && p.name) return p.name;
  if (id === ownerId()) return OWNER_NAME;
  return fallback;
}
const personEmail = (id) => {
  if (id && id === Viewer.id && Viewer.email) return Viewer.email;
  const p = People.get(id);
  const m = MemberStore.get(id);
  return (p && p.email) || (m && m.email) || '';
};
// Author of a report, note or assignment; old records carry only a name, or nothing (the Owner).
const authorName = (userId, legacyName = '') => (userId ? personName(userId) : (legacyName || OWNER_NAME));

// What each person may see and change in reports, assignments and notes.
const canViewReport = (r) => !!r && (can('reports.viewTeam') || (can('reports.viewOwn') && isMine(r.authorId)));
const canEditReport = (r) => !!r && (isMine(r.authorId) ? can('reports.editOwn') : can('reports.editOthers'));
const canDeleteReport = (r) => !!r && (isMine(r.authorId) ? can('reports.deleteOwn') : can('reports.deleteOthers'));
const visibleReports = () => ReportStore.list().filter(canViewReport);
const isMyAssignment = (q) => !!q && isMine(q.assigneeId);
const canViewAssignment = (q) => !!q && (can('assignments.viewAll') || (can('assignments.viewOwn') && isMyAssignment(q)));
// Your own assignments you work on; ones you planned for yourself you may also change; managers change any.
const canWorkAssignment = (q) => !!q && (can('assignments.manage') || (isMyAssignment(q) && can('assignments.viewOwn')));
const canManageAssignment = (q) => !!q && (can('assignments.manage') || (isMyAssignment(q) && isMine(q.createdBy || q.assigneeId)));
const visibleRequests = () => RequestStore.list().filter(canViewAssignment);
const canEditNote = (n) => !!n && (isMine(n.authorId) ? can('notes.editOwn') : can('notes.manage'));
// Financial fields: the permission, and the server actually serving them to this person.
const canSeeFinance = (key) => can(key) && FinanceStore.started();
const financeFor = (playerId) => (FinanceStore.started() && FinanceStore.get(playerId)) || {};

// Which collections each person connects to. A store is never started for someone who cannot use it.
const STORE_ACCESS = [
  [OrgStore, () => true],
  [MemberStore, () => true],
  [JoinRequestStore, () => true],
  [SettingsStore, () => Access.state === 'ready'],
  [PlayerStore, () => canAny('players.view', 'squad.view', 'shortlists.view', 'shadow.view')],
  [SquadStore, () => canAny('players.view', 'squad.view')],
  [NeedStore, () => canAny('shortlists.view', 'squad.view')],
  [ShadowTeamStore, () => can('shadow.view')],
  [ReportStore, () => canAny('reports.viewOwn', 'reports.viewTeam')],
  [RequestStore, () => canAny('assignments.viewOwn', 'assignments.viewAll')],
  [NoteStore, () => can('notes.view')],
  [FinanceStore, () => Viewer.isOwner && FINANCE_FIELDS.some(([, , key]) => can(key))],
  [InviteStore, () => Viewer.isOwner],
  [PresenceStore, () => Viewer.isOwner],
];
function startPermittedStores() { STORE_ACCESS.forEach(([store, ok]) => { if (!store.started() && ok()) store.start(); }); }
function grantOwner() { Access.state = 'ready'; Access.role = 'owner'; Access.perms = new Set(ALL_PERMISSIONS); }

// A member's access from their membership record. Returns true when their permissions changed.
function applyMembership() {
  const before = [...Access.perms].sort().join();
  const m = Viewer.id ? MemberStore.get(Viewer.id) : null;
  if (m && m.status === 'active') {
    Access.state = 'ready';
    Access.role = m.role;
    Access.perms = effectivePermissions(m.role, m.overrides);
  } else {
    Access.state = m ? 'suspended' : (JoinRequestStore.get(Viewer.id) ? 'pending' : 'none');
    Access.role = m ? m.role : null;
    Access.perms = new Set();
  }
  return before !== [...Access.perms].sort().join();
}

async function resolveAccess() {
  const host = !!(window.claude && typeof window.claude.use === 'function');
  if (!host) {
    // Opened outside claude.ai (a saved copy or a local preview): no shared data is reachable,
    // so the page runs as the Owner on an empty copy that is not saved.
    Object.assign(Viewer, { local: true, isOwner: true, name: OWNER_NAME });
    grantOwner();
    startPermittedStores();
    return;
  }
  let ns = null;
  try { ns = await window.claude.use('user'); } catch (e) { ns = null; }
  People.ns = ns;
  if (!ns) { Access.state = 'unknown'; return; }
  const me = await ns.me();
  Object.assign(Viewer, { id: me.id, name: me.name || '', email: me.email || null, isOwner: !!me.isOwner });
  const write = await ns.can('data.write');
  Viewer.level = me.canEdit ? 'admin' : write === true ? 'interact' : write === false ? 'view' : null;
  if (Viewer.isOwner) {
    grantOwner();
    startPermittedStores();
    claimOwnership();
    touchPresence();
    return;
  }
  if (!Viewer.id) { Access.state = 'unknown'; return; }
  [OrgStore, MemberStore, JoinRequestStore].forEach((s) => s.start());
  await Promise.all([OrgStore.ready, MemberStore.ready, JoinRequestStore.ready]);
  applyMembership();
  if (Access.state === 'ready') { startPermittedStores(); touchPresence(); }
}

// The Owner's id is recorded once, so others can see who the Owner is.
async function claimOwnership() {
  await OrgStore.ready;
  const org = OrgStore.get('main');
  if (org && org.ownerId === Viewer.id) return;
  try { await OrgStore.set('main', { name: ORG.name, ownerId: Viewer.id, createdAt: (org && org.createdAt) || new Date().toISOString() }); } catch (e) { /* retried on the next visit */ }
}
// Last activity, written at most every 15 minutes.
async function touchPresence() {
  if (!Viewer.id) return;
  const key = `presence:${Viewer.id}`;
  if (Date.now() - Number(prefs.get(key) || 0) < 15 * 60e3) return;
  try {
    const db = await dbHandle;
    if (!db) return;
    await db.collection('presence').doc(Viewer.id).set({ lastActive: new Date().toISOString(), level: Viewer.level || '' });
    prefs.set(key, String(Date.now()));
  } catch (e) { /* not essential */ }
}

// Membership can change while someone has the platform open (role changed, permissions adjusted, removed).
MemberStore.subscribe(() => {
  if (Viewer.isOwner || Viewer.local || Access.state === 'checking' || Access.state === 'unknown') return;
  const changed = applyMembership();
  if (Access.state === 'ready') startPermittedStores();
  if (changed) { renderSidebar(); navigate(state.route || routeFromHash(), { record: false }); }
});
JoinRequestStore.subscribe(() => {
  if (Viewer.isOwner || Viewer.local || ['checking', 'unknown', 'ready'].includes(Access.state)) return;
  applyMembership();
});

const PlayerRepository = {
  get: (id) => PlayerStore.get(id),
  list: () => PlayerStore.list(),
};

// Deleting a player also removes their squad place, shadow-team places and need candidacies.
async function deletePlayer(id) {
  await PlayerStore.remove(id);
  if (SquadStore.get(id)) await SquadStore.remove(id);
  for (const team of ShadowTeamStore.list()) {
    if (team.entries.some((e) => e.playerId === id)) {
      await ShadowTeamStore.update(team.id, { entries: team.entries.filter((e) => e.playerId !== id) });
    }
  }
  for (const need of NeedStore.list()) {
    const candidates = need.candidates.filter((c) => c.playerId !== id);
    const related = need.relatedPlayerId === id;
    if (candidates.length !== need.candidates.length || related) {
      await NeedStore.update(need.id, { candidates, ...(related ? { relatedPlayerId: '' } : {}) });
    }
  }
  for (const r of ReportStore.list().filter((x) => x.playerId === id)) await ReportStore.remove(r.id);
  for (const r of RequestStore.list().filter((x) => x.playerId === id)) await RequestStore.remove(r.id);
  for (const n of NoteStore.list().filter((x) => x.playerId === id)) await NoteStore.remove(n.id);
  if (FinanceStore.started() && FinanceStore.get(id)) await FinanceStore.remove(id);
}

// Pure list operations on a team's entries. Each returns a new array.
const ShadowOps = {
  list: (team, pos) => team.entries.filter((e) => e.positionId === pos),
  place(entries, entry, pos, index) {
    const others = entries.filter((e) => e.positionId !== pos);
    const list = entries.filter((e) => e.positionId === pos && e.playerId !== entry.playerId);
    const i = Math.max(0, Math.min(index === undefined || Number.isNaN(index) ? list.length : index, list.length));
    list.splice(i, 0, { ...entry, positionId: pos });
    return [...others, ...list];
  },
  add(team, entry, pos, index) {
    return ShadowOps.place(team.entries, entry, pos, index);
  },
  move(team, playerId, fromPos, toPos, index) {
    const list = ShadowOps.list(team, fromPos);
    const fromIndex = list.findIndex((e) => e.playerId === playerId);
    if (fromIndex < 0) return team.entries;
    const entry = list[fromIndex];
    let target = index;
    if (fromPos === toPos && target !== undefined && fromIndex < target) target -= 1;
    return ShadowOps.place(team.entries.filter((e) => e !== entry), entry, toPos, target);
  },
  remove(team, playerId, pos) {
    return team.entries.filter((e) => !(e.playerId === playerId && e.positionId === pos));
  },
};

/* ---------------------------------------------------------------------
   4. DEMO DATA — removed in the single-user phase (6 Oct 2026).
   Every page now shows real data or an empty state.
   --------------------------------------------------------------------- */

/* ---------------------------------------------------------------------
   5. UI KIT (design-system components)
   --------------------------------------------------------------------- */
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const attrs = (obj = {}) => Object.entries(obj)
  .filter(([, v]) => v !== undefined && v !== null && v !== false)
  .map(([k, v]) => (v === true ? k : `${k}="${esc(v)}"`)).join(' ');
const has = (v) => !(v === null || v === undefined || v === '' || (Array.isArray(v) && v.length === 0));
const EMPTY = '—';

function ageFrom(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  if (t.getMonth() < d.getMonth() || (t.getMonth() === d.getMonth() && t.getDate() < d.getDate())) a -= 1;
  return a;
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_PT = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
// 'YYYY-MM-DD' → '30 Jun 2027' ('30 jun 2027' in Portuguese)
function fmtDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? `${Number(m[3])} ${(LANG === 'pt' ? MONTHS_PT : MONTHS)[Number(m[2]) - 1]} ${m[1]}` : (iso || '');
}
const initials = (name) => String(name || '').split(/\s+/).filter(Boolean).slice(0, 2).map((s) => s[0].toUpperCase()).join('');
const posLabel = (code) => (PLAYER_POSITION[code] ? PLAYER_POSITION[code].label : '');
const footLabel = (f) => FEET[f] || '';
const playerAge = (p) => (p && p.birthDate ? ageFrom(p.birthDate) : null);
const squadMember = (playerId) => SquadStore.get(playerId);
const expiresThisSeason = (p) => !!(p && p.contract && p.contract.endDate && p.contract.endDate <= SEASON.end);
// Best formation slot for a player's natural position.
function slotFor(formation, position) {
  const slots = FORMATIONS[formation].map(([s]) => s);
  return (SLOT_FIT[position] || []).find((s) => slots.includes(s)) || slots[0];
}

const ICONS = {
  dashboard: '<rect x="2" y="2" width="7" height="12" rx="1.2"/><rect x="11" y="2" width="3" height="5" rx="1"/><rect x="11" y="9" width="3" height="5" rx="1"/>',
  player:    '<circle cx="8" cy="5" r="2.6"/><path d="M3 14c.6-2.8 2.6-4.3 5-4.3s4.4 1.5 5 4.3"/>',
  eye:       '<path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z"/><circle cx="8" cy="8" r="2"/>',
  target:    '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/><circle cx="8" cy="8" r=".7" fill="currentColor"/>',
  shirt:     '<path d="M5.5 2.5 2.5 4.5 4 7l1.5-.8v7.3h5V6.2L12 7l1.5-2.5-3-2c0 1-.9 1.8-2.5 1.8S5.5 3.5 5.5 2.5z"/>',
  shadow:    '<path stroke-dasharray="2.2 1.6" d="M5.5 2.5 2.5 4.5 4 7l1.5-.8v7.3h5V6.2L12 7l1.5-2.5-3-2c0 1-.9 1.8-2.5 1.8S5.5 3.5 5.5 2.5z"/>',
  transfer:  '<path d="M2.5 5.5h10M10 3l2.5 2.5L10 8"/><path d="M13.5 10.5h-10M6 8l-2.5 2.5L6 13"/>',
  layers:    '<path d="M8 2 14 5 8 8 2 5z"/><path d="M2 8l6 3 6-3"/><path d="M2 11l6 3 6-3"/>',
  chevron:   '<path d="M4.5 6.5 8 10l3.5-3.5"/>',
  chevronR:  '<path d="M6.5 4.5 10 8l-3.5 3.5"/>',
  back:      '<path d="M13 8H3M6.5 4.5 3 8l3.5 3.5"/>',
  up:        '<path d="M4.5 9.5 8 6l3.5 3.5"/>',
  down:      '<path d="M4.5 6.5 8 10l3.5-3.5"/>',
  menu:      '<path d="M2.5 4.5h11M2.5 8h11M2.5 11.5h11"/>',
  arrow:     '<path d="M3 8h10M9.5 4.5 13 8l-3.5 3.5"/>',
  check:     '<path d="M3.5 8.5l3 3 6-7"/>',
  alert:     '<path d="M8 2.5 14 13H2z"/><path d="M8 7v2.5M8 11.4v.1"/>',
  x:         '<path d="M4.5 4.5l7 7M11.5 4.5l-7 7"/>',
  info:      '<circle cx="8" cy="8" r="6"/><path d="M8 7.3V11M8 5v.1"/>',
  calendar:  '<rect x="2.5" y="3.5" width="11" height="10" rx="1.5"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
  flask:     '<path d="M6 2h4M6.5 2v4.2L3.1 12.6a1 1 0 0 0 .9 1.4h8a1 1 0 0 0 .9-1.4L9.5 6.2V2"/><path d="M4.6 10h6.8"/>',
  plus:      '<path d="M8 3v10M3 8h10"/>',
  grid:      '<rect x="2.5" y="2.5" width="11" height="11" rx="1.5"/><path d="M2.5 6.5h11M6.5 6.5v7"/>',
  more:      '<circle cx="3.5" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none"/><circle cx="12.5" cy="8" r="1.1" fill="currentColor" stroke="none"/>',
  compare:   '<rect x="2" y="3" width="5" height="10" rx="1"/><rect x="9" y="3" width="5" height="10" rx="1"/>',
  note:      '<path d="M4 2.5h5.5L12.5 5.5v8H4z"/><path d="M6 8h4.5M6 10.5h4.5"/>',
  download:  '<path d="M8 2.5v8M4.5 7 8 10.5 11.5 7"/><path d="M3 13.5h10"/>',
  share:     '<circle cx="4" cy="8" r="1.8"/><circle cx="12" cy="4" r="1.8"/><circle cx="12" cy="12" r="1.8"/><path d="M5.6 7.1l4.8-2.3M5.6 8.9l4.8 2.3"/>',
  lock:      '<rect x="3.5" y="7" width="9" height="6.5" rx="1.2"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2"/>',
  clock:     '<circle cx="8" cy="8" r="6"/><path d="M8 4.8V8l2.2 1.4"/>',
  pin:       '<path d="M6 2.5h4l-.6 4 2.1 2v1.2h-7V8.5l2.1-2z"/><path d="M8 9.7v3.8"/>',
  trash:     '<path d="M3 4.5h10M6.5 4.5V3h3v1.5M4.5 4.5l.6 9h5.8l.6-9"/>',
  edit:      '<path d="M3 13l.6-2.6 7-7 2 2-7 7z"/>',
  grip:      '<circle cx="6" cy="4" r=".9" fill="currentColor" stroke="none"/><circle cx="10" cy="4" r=".9" fill="currentColor" stroke="none"/><circle cx="6" cy="8" r=".9" fill="currentColor" stroke="none"/><circle cx="10" cy="8" r=".9" fill="currentColor" stroke="none"/><circle cx="6" cy="12" r=".9" fill="currentColor" stroke="none"/><circle cx="10" cy="12" r=".9" fill="currentColor" stroke="none"/>',
  external:  '<path d="M9 2.5h4.5V7M13.5 2.5 7.5 8.5"/><path d="M11.5 9.5v3.5a.5.5 0 0 1-.5.5H3a.5.5 0 0 1-.5-.5V5a.5.5 0 0 1 .5-.5h3.5"/>',
  settings:  '<circle cx="8" cy="8" r="2.2"/><path d="M8 1.6v2M8 12.4v2M1.6 8h2M12.4 8h2M3.5 3.5l1.4 1.4M11.1 11.1l1.4 1.4M3.5 12.5l1.4-1.4M11.1 4.9l1.4-1.4"/>',
  users:     '<circle cx="6" cy="5.5" r="2.2"/><path d="M2 13c.4-2.2 2-3.4 4-3.4s3.6 1.2 4 3.4"/><path d="M10.5 3.6a2.1 2.1 0 0 1 0 4M12 9.8c1.1.4 1.8 1.5 2 3.2"/>',
  timeline:  '<path d="M4 2.5v11"/><circle cx="4" cy="5" r="1.3" fill="currentColor"/><circle cx="4" cy="10.5" r="1.3" fill="currentColor"/><path d="M7 5h6.5M7 10.5h6.5"/>',
  shield:    '<path d="M8 2 13 4v4c0 3-2.2 5-5 6-2.8-1-5-3-5-6V4z"/>',
  pulse:     '<path d="M1.5 8.5h3l1.5-4 3 7 1.5-3h4"/>',
  ball:      '<circle cx="8" cy="8" r="5.8"/><path d="M8 5.2l2.6 1.9-1 3.1H6.4l-1-3.1z"/>',
  list:      '<path d="M6 4.5h7.5M6 8h7.5M6 11.5h7.5"/><circle cx="3" cy="4.5" r=".8" fill="currentColor"/><circle cx="3" cy="8" r=".8" fill="currentColor"/><circle cx="3" cy="11.5" r=".8" fill="currentColor"/>',
  search:    '<circle cx="7" cy="7" r="4.3"/><path d="M10.2 10.2 13.5 13.5"/>',
  upload:    '<path d="M8 10.5v-8M4.5 6 8 2.5 11.5 6"/><path d="M3 13.5h10"/>',
  logout:    '<path d="M6.5 2.5h-3a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h3"/><path d="M10 5l3 3-3 3M13 8H6"/>',
};
function icon(name, cls = '') {
  return `<svg class="ico ${cls}" viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${ICONS[name] || ''}</svg>`;
}

const TONE_ICON = { positive: 'check', warning: 'alert', danger: 'x' };

const UI = {
  pageHeader({ title, desc = '', meta = '', actions = '' }) {
    return `<header class="page-head">
      <div class="page-head__main">
        <h1 class="page-title">${esc(title)}</h1>
        ${desc ? `<p class="page-desc">${esc(desc)}</p>` : ''}
        ${meta ? `<div class="page-meta">${meta}</div>` : ''}
      </div>
      ${actions ? `<div class="page-head__actions">${actions}</div>` : ''}
    </header>`;
  },

  panel({ title = '', meta = '', link = null, actions = '', body = '', flush = false, cls = '', label = '', demo = false }) {
    const head = title ? `<div class="panel__head">
        <div class="panel__heading"><h2 class="panel__title">${esc(title)}</h2>${meta ? `<span class="panel__meta">${esc(meta)}</span>` : ''}${demo ? UI.demoTag() : ''}</div>
        ${link ? UI.linkMore(link.label, link.route) : ''}${actions}
      </div>` : '';
    return `<section class="panel ${cls}"${label ? ` aria-label="${esc(label)}"` : ''}>${head}<div class="panel__body${flush ? ' panel__body--flush' : ''}">${body}</div></section>`;
  },

  sectionTitle(text, aside = '') {
    return `<div class="sec-head"><h3 class="sec-title">${esc(text)}</h3>${aside}</div>`;
  },

  // Status pill: colour + icon + label, so state never relies on colour alone
  status(label, tone = 'neutral') {
    const ic = TONE_ICON[tone] ? icon(TONE_ICON[tone]) : '';
    return `<span class="status status--${tone}">${ic}${esc(label)}</span>`;
  },
  vocab(group, key) {
    const [label, tone] = VOCAB[group][key];
    return UI.status(label, tone);
  },
  priority(level) {
    return `<span class="prio prio--${level}" title="${esc(VOCAB.priority[level])} priority"><span class="prio__bars" aria-hidden="true"><i></i><i></i><i></i></span>${esc(VOCAB.priority[level])}</span>`;
  },
  stage(id) {
    const s = STAGE[id];
    return `<span class="stage-chip" title="Workflow stage ${s.n} of ${WORKFLOW.length}"><span class="stage-chip__n">${s.n}</span>${esc(s.label)}</span>`;
  },
  workflow(activeIds = []) {
    const steps = WORKFLOW.map((s, i) => {
      const on = activeIds.includes(s.id);
      return `<li class="flow__step${on ? ' is-on' : ''}"${on ? ' aria-current="step"' : ''}><span class="flow__n">${String(i + 1).padStart(2, '0')}</span><span class="flow__label">${esc(s.label)}</span></li>`;
    }).join('');
    return `<div class="flow-wrap"><ol class="flow">${steps}</ol></div>`;
  },

  table(cols, rows, { caption = '', empty = '' } = {}) {
    const th = cols.map((c) => `<th scope="col" class="${c.num ? 'ta-r' : ''}"${c.title ? ` title="${esc(c.title)}"` : ''}${c.width ? ` style="width:${c.width}"` : ''}>${esc(c.label)}</th>`).join('');
    const body = rows.length ? rows.map((r) => `<tr>${cols.map((c) => {
      const cls = [c.num ? 'ta-r num' : '', c.cls || ''].join(' ').trim();
      return `<td${cls ? ` class="${cls}"` : ''}>${c.render ? c.render(r) : esc(r[c.key])}</td>`;
    }).join('')}</tr>`).join('')
      : `<tr class="is-empty-row"><td colspan="${cols.length}">${empty}</td></tr>`;
    return `<div class="table-wrap"><table class="table">${caption ? `<caption class="sr-only">${esc(caption)}</caption>` : ''}<thead><tr>${th}</tr></thead><tbody>${body}</tbody></table></div>`;
  },

  kpi({ label, value, sub = '', meter = null, demo = false }) {
    return `<div class="kpi">
      <div class="kpi__label">${esc(label)}${demo ? UI.demoTag() : ''}</div>
      <div class="kpi__value">${esc(value)}</div>
      ${sub ? `<div class="kpi__sub">${esc(sub)}</div>` : ''}
      ${meter !== null ? UI.meter(meter) : ''}
    </div>`;
  },
  meter(ratio) {
    const pct = Math.max(0, Math.min(1, ratio)) * 100;
    return `<div class="meter" role="meter" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.round(pct)}"><span style="width:${pct.toFixed(1)}%"></span></div>`;
  },

  // Label/value list. A missing value shows as a muted dash.
  kv(rows, { cols = 1 } = {}) {
    return `<dl class="kv${cols === 2 ? ' kv--2' : ''}">${rows.map(([label, value]) => `<div class="kv__row"><dt>${esc(label)}</dt>${has(value) ? `<dd>${esc(value)}</dd>` : `<dd class="is-empty">${EMPTY}</dd>`}</div>`).join('')}</dl>`;
  },

  notice(html, iconName = 'info') {
    return `<div class="notice" role="note">${icon(iconName)}<div>${html}</div></div>`;
  },

  emptyState({ iconName = 'grid', title, text = '', action = '', size = '' }) {
    if (size === 'sm') {
      return `<div class="empty empty--sm"><div class="empty__icon">${icon(iconName)}</div><div class="empty__copy"><div class="empty__title">${esc(title)}</div>${text ? `<p class="empty__text">${esc(text)}</p>` : ''}${action}</div></div>`;
    }
    return `<div class="empty${size ? ` empty--${size}` : ''}"><div class="empty__icon">${icon(iconName)}</div><div class="empty__title">${esc(title)}</div>${text ? `<p class="empty__text">${esc(text)}</p>` : ''}${action}</div>`;
  },

  // Button. `inactive` keeps it focusable and explains itself through `msg` on click.
  btn({ label, variant = 'secondary', iconName = '', action, data = {}, inactive = false, msg = '', title = '', iconOnly = false, type = 'button', disabled = false, cls = '' }) {
    const a = {
      type,
      class: `btn btn--${variant}${iconOnly ? ' btn--icon' : ''}${cls ? ` ${cls}` : ''}`,
      'data-action': action,
      'aria-label': iconOnly ? label : undefined,
      title: title || (iconOnly ? label : undefined),
      'aria-disabled': inactive ? 'true' : undefined,
      'data-msg': msg || undefined,
      disabled,
      ...data,
    };
    return `<button ${attrs(a)}>${iconName ? icon(iconName) : ''}${iconOnly ? '' : esc(label)}</button>`;
  },

  select({ id, name, options, value, change, disabled = false, ariaLabel, cls = '' }) {
    const opts = options.map((o) => `<option value="${esc(o.value)}"${String(o.value) === String(value) ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
    return `<select ${attrs({ id, name, class: `select${cls ? ` ${cls}` : ''}`, 'data-change': change, disabled, 'aria-label': ariaLabel })}>${opts}</select>`;
  },

  tabs(items, current, action) {
    return `<div class="tabs" role="tablist">${items.map((t) => {
      const on = t.id === current;
      return `<button type="button" role="tab" class="tab${on ? ' is-active' : ''}" id="tab-${t.id}" aria-selected="${on}" aria-controls="tabpanel" tabindex="${on ? 0 : -1}" data-action="${action}" data-id="${t.id}">${t.icon ? icon(t.icon) : ''}${esc(t.label)}</button>`;
    }).join('')}</div>`;
  },

  // Contextual menu: a trigger button and a popover list of actions.
  menu({ id, label = 'More actions', items, align = 'end' }) {
    const trigger = `<button ${attrs({ type: 'button', class: 'btn btn--secondary btn--icon', 'data-action': 'toggle-menu', 'aria-controls': id, 'aria-haspopup': 'menu', 'aria-expanded': 'false', 'aria-label': label, title: label })}>${icon('more')}</button>`;
    const list = items.map((it) => {
      if (it.sep) return '<div class="menu-sep" role="separator"></div>';
      return `<button ${attrs({
        type: 'button', role: 'menuitem', class: `menu-item${it.danger ? ' is-danger' : ''}`,
        'data-action': it.action, 'aria-disabled': it.inactive ? 'true' : undefined, 'data-msg': it.msg, ...(it.data || {}),
      })}>${icon(it.icon || '')}<span>${esc(it.label)}</span>${it.hint ? `<span class="menu-hint">${esc(it.hint)}</span>` : ''}</button>`;
    }).join('');
    return `<div class="menu-wrap">${trigger}<div class="menu${align === 'start' ? ' menu--start' : ''}" id="${id}" role="menu" hidden>${list}</div></div>`;
  },

  linkMore(label, route) {
    return `<a class="link-more" href="#${route}" data-route="${route}">${esc(label)}${icon('arrow')}</a>`;
  },
  pill(html, cls = '') {
    return `<span class="pill ${cls}">${html}</span>`;
  },
  demoTag() {
    return `<span class="demo-tag" title="Fictional demo data from the foundation phase. It is replaced when this module is built.">Demo</span>`;
  },
  shadowTag(text = 'Separate from the real squad') {
    return `<span class="tag-shadow">${icon('shadow')}${esc(text)}</span>`;
  },
  squadTag(text = `${CLUB.name} · ${SEASON.label}`) {
    return `<span class="tag-squad">${icon('shirt')}${esc(text)}</span>`;
  },
  editButton(action, label, data = {}) {
    return `<button ${attrs({ type: 'button', class: 'icon-btn icon-btn--sm', 'data-action': action, 'aria-label': label, title: label, ...data })}>${icon('edit')}</button>`;
  },

  // Internal status as a five-step track; the current step is the accent.
  statusTrack(current) {
    const idx = INTERNAL_STATUS.findIndex((s) => s.id === current);
    const now = idx >= 0 ? `<div class="status-now">${esc(INTERNAL_STATUS[idx].label)}</div>` : `<div class="status-now is-empty">Not available</div>`;
    const steps = INTERNAL_STATUS.map((s, i) => `<li class="track__step${i < idx ? ' is-done' : ''}${i === idx ? ' is-current' : ''}" title="${esc(s.label)}"><i></i><span>${esc(s.short)}</span></li>`).join('');
    return `${now}<ol class="track" aria-label="Internal status steps">${steps}</ol>`;
  },
};

/* ---------------------------------------------------------------------
   6. VIEWS
   --------------------------------------------------------------------- */

/* ---- 6a. Dashboard (approved module; presentation only simplified) ---- */
// Players on the watchlist with a review date, soonest first (squad players excluded).
const playersToReview = () => PlayerStore.list()
  .filter((p) => p.internalStatus === 'monitoring' && p.reviewOn && !p.closed && !squadMember(p.id))
  .sort((a, b) => a.reviewOn.localeCompare(b.reviewOn));

// Two panels side by side; one alone takes the full row.
const dashRow = (a, okA, b, okB) => {
  const full = (html) => html.replace(/class="panel span-(7|5)"/, 'class="panel span-12"');
  return okA && okB ? a + b : okA ? full(a) : okB ? full(b) : '';
};
function renderDashboard() {
  const today = todayIso();
  const needs = seasonNeeds().filter(isActiveNeed).sort(needCompare);
  const high = needs.filter((n) => n.priority === 'high').length;
  const seasonReports = visibleReports().filter((r) => r.date >= SEASON.start && r.date <= SEASON.end);
  const month = today.slice(0, 7);
  const toWatch = visibleRequests().filter((r) => r.status === 'open');
  const overdue = toWatch.filter((r) => r.dueBy && r.dueBy < today).length;
  const review = playersToReview();
  // Each block appears only for people who may see what it summarises.
  const show = {
    priorities: can('shortlists.view'), squad: can('squad.view'), assignments: canAny('assignments.viewOwn', 'assignments.viewAll'),
    review: can('players.view'), reports: canAny('reports.viewOwn', 'reports.viewTeam'),
  };
  const kpis = [
    show.reports && { label: 'Players scouted', value: String(new Set(seasonReports.map((r) => r.playerId)).size), sub: 'Season to date' },
    show.reports && { label: 'Reports this month', value: String(visibleReports().filter((r) => (r.date || '').startsWith(month)).length), sub: `${seasonReports.length} this season` },
    show.assignments && { label: 'Open assignments', value: String(toWatch.length), sub: toWatch.length ? (overdue ? `${overdue} overdue` : 'None overdue') : 'Nothing planned' },
    show.priorities && { label: 'Recruitment priorities', value: String(needs.length), sub: needs.length ? `${high} high priority` : 'No active needs' },
  ].filter(Boolean);
  const kpiStrip = kpis.length ? `<section class="panel" aria-label="Key figures"><div class="kpis">${kpis.map(UI.kpi).join('')}</div></section>` : '';
  const none = `<span class="faint">${EMPTY}</span>`;
  const playerCell = (p) => (p
    ? `<button type="button" class="row-link cell-strong" data-action="open-player" data-id="${esc(p.id)}">${esc(p.name)}</button><span class="cell-sub">${esc([p.position, clubOf(p)].filter(Boolean).join(' · '))}</span>`
    : '<span class="faint">Player unavailable</span>');

  const priorities = UI.panel({
    cls: 'span-7', title: 'Recruitment Priorities', link: { label: 'Recruitment Needs', route: 'squad-needs' }, flush: true,
    body: needs.length
      ? needsTable(needs.slice(0, 6), { compact: true })
      : `<div class="panel__body">${UI.emptyState({ size: 'sm', iconName: 'target', title: 'No active recruitment needs', action: UI.linkMore('Create a need', 'squad-needs') })}</div>`,
  });

  const depth = squadDepth().filter((r) => r.players.length || r.openNeeds);
  const hasSquad = depth.some((r) => r.players.length);
  const squadNeeds = UI.panel({
    cls: 'span-5', title: 'Squad Needs', link: { label: 'Recruitment Needs', route: 'squad-needs' }, flush: true,
    body: hasSquad ? `<div class="dash-depth">${UI.table([
      { label: 'Position', render: (r) => `<span class="pos">${esc(r.pos)}</span>${esc(posLabel(r.pos))}` },
      { label: 'Players', render: (r) => `<span class="num ${r.players.length <= 1 ? 'depth-low' : 'cell-strong'}">${r.players.length}</span><span class="dots" aria-hidden="true">${'<i></i>'.repeat(Math.min(r.players.length, 6))}</span>` },
      { label: 'Ending', num: true, title: `Contracts ending by ${fmtDate(SEASON.end)}`, render: (r) => (r.ending ? `<span class="depth-low">${r.ending}</span>` : '<span class="faint">0</span>') },
      { label: 'Need', render: (r) => (r.openNeeds ? UI.status(r.openNeeds === 1 ? 'Open need' : `${r.openNeeds} open needs`, 'warning') : none) },
    ], depth, { caption: 'Squad depth and open needs by position' })}</div>`
      : `<div class="panel__body">${UI.emptyState({ size: 'sm', iconName: 'shirt', title: `No ${SEASON.label} squad loaded`, action: UI.linkMore('First Team', 'squad-first-team') })}</div>`,
  });

  const watchPanel = UI.panel({
    cls: 'span-7', title: can('assignments.viewAll') ? 'Assignments' : 'My Assignments', meta: toWatch.length > 6 ? `Next 6 of ${toWatch.length}` : '', link: { label: 'Assignments', route: 'scouting-assignments' }, flush: true,
    body: toWatch.length ? UI.table([
      { label: 'Watch by', render: (r) => (r.dueBy ? (r.dueBy < today ? UI.status(fmtDate(r.dueBy), 'warning') : `<span class="num">${esc(fmtDate(r.dueBy))}</span>`) : none) },
      { label: 'Player', cls: 'wrap', render: (r) => playerCell(PlayerStore.get(r.playerId)) },
      ...(showScoutColumn(toWatch) ? [{ label: 'Scout', render: (r) => esc(authorName(r.assigneeId, r.scout)) }] : []),
      { label: 'Match', cls: 'wrap', render: (r) => (r.match ? esc(r.match) : none) },
    ], toWatch.slice(0, 6), { caption: 'Open assignments' })
      : `<div class="panel__body">${UI.emptyState({ size: 'sm', iconName: 'calendar', title: 'No open assignments', action: UI.linkMore('Assignments', 'scouting-assignments') })}</div>`,
  });

  const reviewPanel = UI.panel({
    cls: 'span-5', title: 'To Review', meta: review.length > 6 ? `First 6 of ${review.length}` : '', link: { label: 'Player Database', route: 'players-database' }, flush: true,
    body: review.length ? UI.table([
      { label: 'Player', cls: 'wrap', render: (p) => playerCell(p) },
      { label: 'Review on', render: (p) => (p.reviewOn <= today ? UI.status(fmtDate(p.reviewOn), 'warning') : `<span class="num">${esc(fmtDate(p.reviewOn))}</span>`) },
      { label: 'Level', render: (p) => levelBadge(reportsFor(p.id)[0]) },
    ], review.slice(0, 6), { caption: 'Watchlist players with a review date' })
      : `<div class="panel__body">${UI.emptyState({ size: 'sm', iconName: 'clock', title: 'No players to review', text: 'A report that recommends “Monitor” sets a review date.' })}</div>`,
  });

  const latest = visibleReports().slice(0, 5);
  const reportsPanel = UI.panel({
    cls: 'span-12', title: 'Latest Reports', link: { label: 'Observation Reports', route: 'scouting-reports' }, flush: true,
    body: latest.length ? UI.table([
      { label: 'Date', render: (r) => `<span class="num">${esc(fmtDate(r.date))}</span>` },
      { label: 'Player', cls: 'wrap', render: (r) => { const p = PlayerStore.get(r.playerId); return `<button type="button" class="row-link cell-strong" data-action="report-view" data-id="${esc(r.id)}">${esc(p ? p.name : 'Player unavailable')}</button><span class="cell-sub">${esc(p ? [p.position, clubOf(p)].filter(Boolean).join(' · ') : '')}</span>`; } },
      { label: 'Type', render: (r) => typeChip(r.type) },
      { label: 'Level', render: (r) => levelBadge(r) },
      { label: 'Recommendation', render: (r) => recChip(r.recommendation) },
      { label: 'Need', render: (r) => { const n = r.needId ? NeedStore.get(r.needId) : null; return n ? esc(n.position) : none; } },
    ], latest, { caption: 'Latest observation reports' })
      : `<div class="panel__body">${UI.emptyState({ size: 'sm', iconName: 'eye', title: 'No reports yet', action: UI.linkMore('Observation Reports', 'scouting-reports') })}</div>`,
  });

  return `<div class="page">
    ${UI.pageHeader({ title: 'Dashboard' })}
    ${kpiStrip}
    <div class="grid">${dashRow(priorities, show.priorities, squadNeeds, show.squad)}${dashRow(watchPanel, show.assignments, reviewPanel, show.review)}${show.reports ? reportsPanel : ''}</div>
    ${Object.values(show).some(Boolean) ? '' : `<section class="panel">${UI.emptyState({ iconName: 'lock', title: 'Nothing to show yet', text: 'Your role does not include any of the areas summarised here.' })}</section>`}
  </div>`;
}

/* ---- 6b. Scaffold for modules not built yet ---- */
const SK = {
  bar(width, height) {
    return `<span class="sk" style="width:${width}${height ? `;height:${height}px` : ''}"></span>`;
  },
  rows(n, widths = [24, 16, 12, 12, 10, 12], head = false) {
    let out = '';
    for (let i = 0; i < n; i++) {
      out += `<div class="sk-row">${widths.map((w, j) => {
        const v = head ? Math.round(w * 0.55) : Math.max(5, w - ((i * 3 + j * 5) % 7));
        return `<span class="sk${head ? ' sk--head' : ''}" style="flex:0 0 ${v}%"></span>`;
      }).join('')}</div>`;
    }
    return out;
  },
  table(n = 8, widths) { return SK.rows(1, widths, true) + SK.rows(n, widths); },
  pills(n) {
    return `<div class="sk-pills">${Array.from({ length: n }, (_, i) => `<span class="sk-pill" style="width:${[112, 88, 96, 120, 80][i % 5]}px"></span>`).join('')}</div>`;
  },
  fields(n) {
    return Array.from({ length: n }, (_, i) => `<div class="sk-field">${SK.bar(`${[42, 30, 55, 36, 48, 28][i % 6]}%`)}<span class="sk-input"></span></div>`).join('');
  },
  region(label, inner) {
    return `<div class="region"><span class="region__label">${esc(label)}</span>${inner}</div>`;
  },
};

const PITCH_SLOTS = [[6, 34], [20, 10], [18, 26], [18, 42], [20, 58], [40, 20], [37, 34], [40, 48], [64, 12], [70, 34], [64, 56]];
function pitchOutline() {
  const slots = PITCH_SLOTS.map(([x, y]) => `<circle class="slot" cx="${x}" cy="${y}" r="3.4"/>`).join('');
  return `<svg class="pitch" viewBox="0 0 105 68" role="img" aria-label="Pitch outline with squad position slots">
    <rect class="ln" x="0.5" y="0.5" width="104" height="67" rx="1"/>
    <line class="ln" x1="52.5" y1="0.5" x2="52.5" y2="67.5"/>
    <circle class="ln" cx="52.5" cy="34" r="9.15"/>
    <rect class="ln" x="0.5" y="13.85" width="16.5" height="40.3"/>
    <rect class="ln" x="88" y="13.85" width="16.5" height="40.3"/>
    <rect class="ln" x="0.5" y="24.85" width="5.5" height="18.3"/>
    <rect class="ln" x="99" y="24.85" width="5.5" height="18.3"/>
    ${slots}
  </svg>`;
}

const SCAFFOLDS = {
  table: () => SK.region('Filters', SK.pills(4)) + SK.region('Table', SK.table(8)),
  search: () => `<div class="sc sc-side">${SK.region('Criteria', SK.fields(6))}${SK.region('Results', SK.table(8, [26, 14, 12, 12, 12, 10]))}</div>`,
  compare: () =>
    SK.region('Selection', SK.pills(3)) +
    `<div class="sc sc-3">${['A', 'B', 'C'].map((x) => SK.region(`Player ${x}`, `<div class="sk-hero"><span class="sk-circle"></span><div class="sk-stack">${SK.bar('60%', 10)}${SK.bar('40%')}</div></div>${SK.rows(5, [50, 30])}`)).join('')}</div>`,
  overview: () =>
    `<div class="sc sc-4">${Array.from({ length: 4 }, () => SK.region('Figure', `<div class="sk-stack">${SK.bar('36%', 18)}${SK.bar('62%')}</div>`)).join('')}</div>` +
    `<div class="sc sc-2">${SK.region('Panel', SK.rows(6, [44, 22, 16]))}${SK.region('Panel', SK.rows(6, [30, 30, 20]))}</div>`,
  board: () => {
    const cols = ['shortlist', 'approval', 'process', 'signing'];
    return `<div class="board-wrap"><div class="board">${cols.map((id, i) => `<div class="board-col"><div class="board-col__head">${UI.stage(id)}</div>${'<span class="sk-card"></span>'.repeat(Math.max(1, 4 - i))}</div>`).join('')}</div></div>`;
  },
  split: () => `<div class="sc sc-side">${SK.region('Lists', SK.rows(7, [62, 18]))}${SK.region('Candidates', SK.table(8, [8, 26, 14, 14, 12, 12]))}</div>`,
  pitch: () => `<div class="sc sc-pitch">${SK.region('Formation', pitchOutline())}${SK.region('Depth by position', SK.rows(10, [12, 40, 22]))}</div>`,
};

function renderScaffold(page) {
  const build = SCAFFOLDS[page.layout] || SCAFFOLDS.table;
  const actions = page.spec
    ? `<a class="btn btn--ghost" href="${esc(page.spec)}" target="_blank" rel="noopener">${icon('note')}Specification${icon('external', 'ico--xs')}</a>`
    : '';
  return `<div class="page">
    ${UI.pageHeader({ title: page.label, desc: page.purpose, meta: page.stages.map(UI.stage).join(''), actions })}
    <section class="panel">
      ${UI.emptyState({ iconName: 'grid', title: 'Not built yet', text: 'This module is designed and built in its own phase.' })}
      <details class="acc acc--panel">
        <summary>${icon('layers')}<span>Planned layout</span>${icon('chevron', 'chev')}</summary>
        <div class="acc__body"><div class="scaffold">${build(page)}</div></div>
      </details>
    </section>
  </div>`;
}

/* ---- 6c. Player Profile ---- */
const currentPlayer = () => PlayerRepository.get(state.playerId);
const clubOf = (p) => (p ? p.club || (squadMember(p.id) ? CLUB.name : null) : null);
const competitionOf = (p) => (p ? p.competition || (squadMember(p.id) ? CLUB.competition : null) : null);

function profileHeader(p) {
  const member = p ? squadMember(p.id) : null;
  // Positions are edited in place: the header values open the Positions dialog.
  const posBtn = (text, add) => `<button type="button" class="pp-fact-btn${add ? ' is-add' : ''}" data-action="pos-edit" title="Edit positions">${add ? icon('plus') : ''}${esc(text)}</button>`;
  const secondary = p && has(p.secondaryPositions) ? p.secondaryPositions.join(', ') : null;
  const facts = [
    ['Age', has(playerAge(p)) ? String(playerAge(p)) : null],
    ['Nationality', p && p.nationality],
    ['Club', clubOf(p)],
    ['Position', p && posLabel(p.position), p ? posBtn(p.position ? posLabel(p.position) : 'Add position', !p.position) : ''],
    ['Also plays', secondary, secondary ? posBtn(secondary) : ''],
    ['Foot', p && footLabel(p.foot)],
  ];
  const c = (p && p.contract) || {};
  const extra = [['Contract until', fmtDate(c.endDate)], ['Value', p && canSeeFinance('financial.viewMarket') ? financeFor(p.id).marketValue : ''], ['Agent', c.agent]].filter(([, v]) => has(v));

  // Only actions that work. Add to Shortlist is for players outside the squad.
  const primary = PLAYER_ACTIONS.primary.filter((a) => a.ready && !(a.id === 'shortlist' && member)).map((a) => UI.btn({
    label: a.label, iconName: a.icon, variant: a.variant || 'secondary', action: 'player-action',
    data: { 'data-id': a.id }, inactive: !p, msg: p ? '' : 'Open a player from the Player Database first.',
  })).join('');

  const items = p ? [
    { label: 'Add to Shadow Team', icon: 'shadow', action: 'open-add-shadow' },
    member
      ? { label: 'Squad details', icon: 'shirt', action: 'squad-edit', data: { 'data-id': p.id } }
      : { label: `Add to ${SEASON.label} squad`, icon: 'shirt', action: 'squad-add-existing' },
    { label: 'Edit player', icon: 'edit', action: 'player-edit' },
    { sep: true },
    { label: 'Delete player', icon: 'trash', action: 'player-delete', danger: true },
  ] : [];

  return `<header class="pp-head">
    <div class="pp-id">
      <div class="pp-photo">${p && p.photoUrl ? `<img src="${esc(p.photoUrl)}" alt="">` : p ? `<span class="pp-initials">${esc(initials(p.name))}</span>` : icon('player')}</div>
      <div class="pp-main">
        <h1 class="pp-name${p ? '' : ' is-empty'}">${p ? esc(p.name) : 'No player selected'}</h1>
        ${p ? (member ? `<div>${UI.squadTag()}</div>` : (p.closed ? `<div>${UI.status('Not for us', 'danger')}</div>` : '')) : `<p class="pp-hint">Open a player from the <a href="#players-database" data-route="players-database">Player Database</a> to load a profile.</p>`}
        <dl class="pp-facts">${facts.map(([k, v, html]) => `<div class="pp-fact"><dt>${esc(k)}</dt>${html ? `<dd>${html}</dd>` : has(v) ? `<dd>${esc(v)}</dd>` : `<dd class="is-empty">${EMPTY}</dd>`}</div>`).join('')}</dl>
        ${extra.length ? `<div class="pp-extra">${extra.map(([k, v]) => `<span>${esc(k)} <b>${esc(v)}</b></span>`).join('')}</div>` : ''}
      </div>
    </div>
    <div class="pp-actions">${primary}${items.length ? UI.menu({ id: 'pp-more', items }) : ''}</div>
  </header>`;
}

function squadStatusBlock(p, member) {
  const [label, tone] = VOCAB.squadStatus[member.status];
  return `<div class="squad-block">
    <span class="marker marker--squad">${member.shirtNumber ?? EMPTY}</span>
    <div><div class="status-now">In the ${esc(SEASON.label)} squad</div><div style="margin-top:6px">${UI.status(label, tone)}</div></div>
    ${UI.editButton('squad-edit', 'Squad details', { 'data-id': p.id })}
  </div>`;
}

// Notes: helpers for Player Profile › Notes
const noteCategoryOptions = () => NOTE_CATEGORIES.map((c) => ({ value: c.toLowerCase(), label: c }));
const noteCategoryLabel = (id) => NOTE_CATEGORIES.find((c) => c.toLowerCase() === id) || 'General';
function fmtStamp(iso, { time = true } = {}) {
  const d = new Date(iso);
  if (!iso || Number.isNaN(d.getTime())) return '';
  const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return time ? `${fmtDate(day)} · ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}` : fmtDate(day);
}
const noteStamp = (n) => fmtStamp(n.createdAt, { time: !n.imported });
function noteItem(n) {
  const edited = n.updatedAt && n.createdAt && (new Date(n.updatedAt) - new Date(n.createdAt)) > 60000;
  const d = { 'data-id': n.id };
  return `<li class="note">
    <div class="note__meta">
      <span class="chip chip--sm">${esc(noteCategoryLabel(n.category))}</span>
      <span class="num">${esc(noteStamp(n))}</span>${n.imported ? '<span>· imported</span>' : ''}${edited ? `<span title="${esc(fmtStamp(n.updatedAt))}">· edited</span>` : ''}${showAuthors() && !n.imported ? `<span>· ${esc(authorName(n.authorId, n.author))}</span>` : ''}
      <span class="row-actions">
        <button ${attrs({ type: 'button', class: 'icon-btn icon-btn--sm', 'data-action': 'note-edit', 'aria-label': 'Edit note', title: 'Edit note', ...d })}>${icon('edit')}</button>
        <button ${attrs({ type: 'button', class: 'icon-btn icon-btn--sm', 'data-action': 'note-delete', 'aria-label': 'Delete note', title: 'Delete note', ...d })}>${icon('trash')}</button>
      </span>
    </div>
    <p class="note__text" translate="no">${esc(n.text)}</p>
  </li>`;
}
function openNoteDialog(note) {
  if (!note) return;
  openDialog(`<form class="dlg-body" data-form="note-edit" data-id="${esc(note.id)}" novalidate>
    <h2 class="dlg-title" id="dlg-title">Edit note</h2>
    <div class="field"><label for="ne-text">Note</label><textarea id="ne-text" name="text" class="textarea" rows="6" maxlength="2000">${esc(note.text)}</textarea><p class="field-error" id="ne-text-error" hidden>The note cannot be empty.</p></div>
    <div class="field"><label for="ne-category">Category</label>${UI.select({ id: 'ne-category', name: 'category', value: note.category, options: noteCategoryOptions() })}</div>
    ${dialogActions('Save changes')}
  </form>`);
}
function openDeleteNoteDialog(note) {
  if (!note) return;
  const preview = note.text.length > 120 ? `${note.text.slice(0, 120)}…` : note.text;
  openDialog(`<form class="dlg-body" data-form="note-delete" data-id="${esc(note.id)}">
    <h2 class="dlg-title" id="dlg-title">Delete this note?</h2>
    <p class="dlg-text">“${esc(preview)}” · ${esc(noteStamp(note))}. This cannot be undone.</p>
    ${dialogActions('Delete note', { variant: 'danger' })}
  </form>`);
}

const PROFILE_VIEWS = {
  overview(p) {
    const edit = p ? UI.editButton('player-edit', 'Edit player') : '';
    const member = p ? squadMember(p.id) : null;
    const profile = UI.kv([
      ['Full name', p && p.fullName],
      ['Date of birth', p && fmtDate(p.birthDate)],
      ['Age', has(playerAge(p)) ? String(playerAge(p)) : null],
      ['Height', p && has(p.heightCm) ? `${p.heightCm} cm` : null],
      ['Nationality', p && p.nationality],
      ['Second nationality', p && p.secondNationality],
      ['Primary position', p && posLabel(p.position)],
      ['Secondary positions', p && has(p.secondaryPositions) ? p.secondaryPositions.map(posLabel).join(', ') : null],
      ['Preferred foot', p && footLabel(p.foot)],
    ], { cols: 2 });
    const current = UI.kv([
      ['Club', clubOf(p)],
      ['Competition', competitionOf(p)],
      ['Contract until', p && fmtDate(p.contract.endDate)],
      ['Squad role', p && p.squadRole],
      ['Availability', p && p.availability],
    ], { cols: 2 });
    const watch = p && !member ? [
      p.closed ? `<div class="status-note">${UI.status('Not for us', 'danger')}<span>${esc([CLOSE_REASONS[p.closed.reason], fmtDate(p.closed.date)].filter(Boolean).join(' · '))}</span>${UI.btn({ label: 'Reopen', variant: 'ghost', action: 'player-reopen', cls: 'btn--sm' })}</div>` : '',
      p.internalStatus === 'monitoring' && p.reviewOn ? `<div class="status-note">${icon('calendar')}<span>Review on ${esc(fmtDate(p.reviewOn))}</span>${p.reviewOn <= todayIso() ? UI.status('Due', 'warning') : ''}</div>` : '',
    ].join('') : '';
    const status = (member ? squadStatusBlock(p, member) : UI.statusTrack(p ? (p.internalStatus || 'untracked') : null)) + watch;
    const needs = p ? needsForPlayer(p.id).sort(needCompare) : [];
    const needsBlock = needs.length ? `<div class="panel__section">${UI.sectionTitle('Recruitment needs')}<ul class="need-links">${needs.map((n) => `<li><button type="button" class="row-link" data-action="need-goto" data-id="${esc(n.id)}">${esc(needLabel(n))}</button>${needStatusChip(n)}</li>`).join('')}</ul></div>` : '';
    return `<div class="pp-grid">
      <section class="panel">
        <div class="panel__section">${UI.sectionTitle('Profile', edit)}${profile}</div>
        <div class="panel__section">${UI.sectionTitle('Current situation', edit)}${current}</div>
      </section>
      <section class="panel">
        <div class="panel__section">${UI.sectionTitle(member ? 'Squad' : 'Internal status', member || !p ? '' : edit)}${status}</div>
        ${needsBlock}
      </section>
    </div>`;
  },

  performance() {
    const g = PERFORMANCE_GROUPS.find((x) => x.id === state.perfGroup) || PERFORMANCE_GROUPS[0];
    const toolbar = `<div class="toolbar">
      ${UI.select({ id: 'perf-season', options: [{ value: '', label: 'Season' }], disabled: true, ariaLabel: 'Season' })}
      ${UI.select({ id: 'perf-competition', options: [{ value: '', label: 'Competition' }], disabled: true, ariaLabel: 'Competition' })}
      <div class="seg is-disabled" role="group" aria-label="View"><button type="button" class="seg__btn is-active" aria-pressed="true" disabled>Table</button><button type="button" class="seg__btn" aria-pressed="false" disabled>Chart</button></div>
      <label class="check is-disabled" for="perf-peers"><input type="checkbox" id="perf-peers" disabled>Percentiles vs same position</label>
      <span class="toolbar__note">No data provider connected</span>
    </div>`;
    const nav = `<nav class="subnav" aria-label="Metric groups">${PERFORMANCE_GROUPS.map((x) => `<button type="button" class="subnav__item${x.id === g.id ? ' is-active' : ''}" data-action="perf-group" data-id="${x.id}"${x.id === g.id ? ' aria-current="true"' : ''}>${icon(x.icon)}${esc(x.label)}</button>`).join('')}</nav>`;
    const body = UI.emptyState({ iconName: g.icon, title: `No ${g.label.toLowerCase()} data`, text: 'Metrics appear here once a data provider is connected.' });
    return `${toolbar}<section class="panel"><div class="perf">${nav}<div class="perf__body">${body}</div></div></section>`;
  },

  scouting(p) {
    const n = p ? '0' : EMPTY;
    const summary = `<section class="panel"><div class="split">
      <div class="panel__section">${UI.sectionTitle('Summary')}${UI.kv([['Reports', p ? '0' : null], ['Observations', p ? '0' : null], ['Last observed', null], ['Scouts', p ? '0' : null]])}</div>
      <div class="panel__section">${UI.sectionTitle('Recommendation')}<div class="rec is-empty">No recommendation yet</div></div>
    </div></section>`;
    const groups = [
      ['Reports', 'note', 'No reports yet'],
      ['Observations', 'eye', 'No observations yet'],
      ['Scouts', 'users', 'Nobody has observed this player'],
      ['Strengths & concerns', 'list', 'No strengths or concerns recorded'],
    ];
    const accs = groups.map(([label, ic, empty]) => `<details class="acc">
      <summary>${icon(ic)}<span>${esc(label)}</span><span class="acc__count">${n}</span>${icon('chevron', 'chev')}</summary>
      <div class="acc__body">${UI.emptyState({ size: 'sm', iconName: ic, title: empty })}</div>
    </details>`).join('');
    return `${summary}<section class="panel">${accs}</section>`;
  },

  career() {
    const empty = UI.emptyState({ size: 'sm', iconName: 'timeline', title: 'No career history available' });
    return UI.panel({
      flush: true, label: 'Career history',
      body: UI.table([{ label: 'Season' }, { label: 'Club' }, { label: 'Competition' }, { label: 'Move' }], [], { caption: 'Career history', empty }),
    });
  },

  // Contract details follow Players permissions; each financial field follows its own permission.
  contract(p) {
    const c = (p && p.contract) || {};
    const edit = p ? UI.editButton('player-edit', 'Edit contract', { 'data-section': 'contract' }) : '';
    const f = p ? financeFor(p.id) : {};
    const shown = FINANCE_FIELDS.filter(([k, , key]) => k !== 'notes' && canSeeFinance(key));
    const notesOk = canSeeFinance('financial.viewNotes');
    const finEdit = p && can('financial.edit') && FinanceStore.started() ? edit : '';
    const anyFinance = shown.length || notesOk;
    return `${anyFinance ? '' : `<div class="restricted">${icon('lock')}<span>Financial information is restricted to authorised roles.</span></div>`}
    <section class="panel">
      <div class="split">
        <div class="panel__section">${UI.sectionTitle('Contract', edit)}${UI.kv([['Current contract', c.current], ['End date', fmtDate(c.endDate)], ['Option', c.option], ['Club', c.club], ['Agent', c.agent], ['Loan situation', c.loan]])}</div>
        ${shown.length ? `<div class="panel__section">${UI.sectionTitle('Financial', finEdit)}${UI.kv(shown.map(([k, l]) => [l, f[k]]))}</div>` : ''}
      </div>
      ${notesOk ? `<div class="panel__section">${UI.sectionTitle('Financial notes', finEdit)}${has(f.notes) ? `<p style="white-space:pre-wrap" translate="no">${esc(f.notes)}</p>` : `<p class="faint">No financial notes.</p>`}</div>` : ''}
    </section>`;
  },

  notes(p) {
    const off = !p;
    const notes = p ? notesFor(p.id) : [];
    const form = `<section class="panel" data-lock-scope><form class="note-form" data-form="note" data-lock="hide" data-player="${p ? esc(p.id) : ''}" novalidate>
      <label class="sr-only" for="note-text">Note</label>
      <textarea id="note-text" name="text" class="textarea" rows="3" maxlength="2000" data-keep placeholder="${off ? 'Open a player to add notes' : 'Write a note…'}"${off ? ' disabled' : ''}></textarea>
      <p class="field-error" id="note-text-error" hidden>Write the note first.</p>
      <div class="note-form__bar">
        <label class="sr-only" for="note-category">Category</label>
        ${UI.select({ id: 'note-category', name: 'category', options: noteCategoryOptions(), disabled: off, ariaLabel: 'Category' })}
        <button type="submit" class="btn btn--primary"${off ? ' disabled' : ''}>${icon('plus')}Add note</button>
      </div>
    </form></section>`;
    const history = notes.length
      ? `<ul class="notes">${notes.map(noteItem).join('')}</ul>`
      : `<div class="panel__body">${UI.emptyState({ size: 'sm', iconName: 'note', title: 'No notes yet' })}</div>`;
    return `${form}${UI.panel({ title: 'History', meta: notes.length ? `${notes.length} note${notes.length === 1 ? '' : 's'}` : '', flush: true, body: history })}`;
  },
};

function renderPlayerProfile() {
  const p = currentPlayer();
  const tabs = PROFILE_TABS.filter((t) => t.enabled !== false);
  const tab = tabs.find((t) => t.id === state.profileTab) || tabs[0];
  return `<div class="page">
    ${profileHeader(p)}
    <div>
      ${UI.tabs(tabs, tab.id, 'profile-tab')}
      <div class="tabpanel" role="tabpanel" id="tabpanel" aria-labelledby="tab-${tab.id}" style="padding-top:20px">${PROFILE_VIEWS[tab.id](p)}</div>
    </div>
  </div>`;
}

/* ---- 6d. Player Database ---- */
const normText = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
// Searches match stored values and, in Portuguese, the names shown on screen.
const searchTerms = (list) => (LANG === 'pt' ? [...list, ...list.map((v) => (v ? tr(v) : v))] : list);

function filteredPlayers() {
  const q = normText(state.db.q.trim());
  return PlayerStore.list().filter((p) => {
    if (state.db.pos && p.position !== state.db.pos && !p.secondaryPositions.includes(state.db.pos)) return false;
    const member = !!squadMember(p.id);
    if (state.db.scope === 'squad' && !member) return false;
    if (state.db.scope === 'external' && member) return false;
    if (state.db.status === 'closed' && !p.closed) return false;
    if (state.db.status && state.db.status !== 'closed' && ((p.internalStatus || 'untracked') !== state.db.status || p.closed)) return false;
    if (!q) return true;
    return searchTerms([p.name, p.fullName, p.club, p.competition, p.nationality, p.secondNationality, p.position, posLabel(p.position)])
      .some((v) => normText(v).includes(q));
  });
}

function playerNameCell(p, sub = '') {
  return `<div class="name-cell"><span class="avatar avatar--sm" aria-hidden="true">${esc(initials(p.name))}</span><div style="min-width:0"><button type="button" class="row-link cell-strong" data-action="open-player" data-id="${esc(p.id)}">${esc(p.name)}</button>${sub ? `<span class="cell-sub">${esc(sub)}</span>` : ''}</div></div>`;
}

function dbResults() {
  const rows = filteredPlayers();
  const total = PlayerStore.list().length;
  const count = `<span class="panel__meta">${rows.length === total ? `${total} player${total === 1 ? '' : 's'}` : `${rows.length} of ${total}`}</span>`;
  const head = `<div class="panel__head"><div class="panel__heading"><h2 class="panel__title">Players</h2>${count}</div></div>`;
  const statusCell = (p) => {
    if (squadMember(p.id)) return UI.squadTag('Our squad');
    if (p.closed) return UI.status('Not for us', 'danger');
    const s = INTERNAL_STATUS.find((x) => x.id === (p.internalStatus || 'untracked'));
    const due = s.id === 'monitoring' && p.reviewOn && p.reviewOn <= todayIso();
    return `<span class="${s.id === 'untracked' ? 'faint' : 'muted'}">${esc(s.label)}</span>${due ? ` ${UI.status('Review due', 'warning')}` : ''}`;
  };
  const empty = `${UI.emptyState({ size: 'sm', iconName: 'search', title: 'No players match these filters' })}<div style="padding:0 0 12px">${UI.btn({ label: 'Clear filters', variant: 'ghost', action: 'db-clear' })}</div>`;
  const table = `<div class="table-wrap"><table class="table"><caption class="sr-only">Players</caption>
    <thead><tr><th scope="col">Player</th><th scope="col">Position</th><th scope="col" title="Latest report: current level → potential">Level</th><th scope="col" class="ta-r">Age</th><th scope="col">Nationality</th><th scope="col">Club</th><th scope="col">Foot</th><th scope="col">Status</th></tr></thead>
    <tbody>${rows.length ? rows.map((p) => `<tr class="is-clickable" data-action="open-player" data-id="${esc(p.id)}">
      <td>${playerNameCell(p, p.fullName && p.fullName !== p.name ? p.fullName : '')}</td>
      <td>${p.position ? `<span class="pos" title="${esc(posLabel(p.position))}">${esc(p.position)}</span>` : `<span class="faint">${EMPTY}</span>`}</td>
      <td>${levelBadge(latestReport(p.id))}</td>
      <td class="ta-r num">${has(playerAge(p)) ? playerAge(p) : `<span class="faint">${EMPTY}</span>`}</td>
      <td>${p.nationality ? esc(p.nationality) : `<span class="faint">${EMPTY}</span>`}</td>
      <td>${p.club ? esc(p.club) : `<span class="faint">${EMPTY}</span>`}</td>
      <td>${p.foot ? esc(footLabel(p.foot)) : `<span class="faint">${EMPTY}</span>`}</td>
      <td>${statusCell(p)}</td>
    </tr>`).join('') : `<tr class="is-empty-row"><td colspan="8">${empty}</td></tr>`}</tbody>
  </table></div>`;
  return head + table;
}

function renderPlayerDatabase() {
  const all = PlayerStore.list();
  const addBtn = (label) => UI.btn({ label, iconName: 'plus', variant: 'primary', action: 'player-new' });
  const importBtn = (label) => UI.btn({ label, iconName: 'upload', action: 'import-open' });
  let body;
  if (!all.length && PlayerStore.status() === 'connecting') {
    body = `<section class="panel"><div class="loading">Loading players…</div></section>`;
  } else if (!all.length) {
    body = `<section class="panel">${UI.emptyState({
      size: 'lg', iconName: 'player', title: 'No players yet',
      text: 'Add players one by one, or import a list from Excel or CSV. Only the name is required.',
      action: `<div class="empty__actions">${addBtn('Add player')}${importBtn('Import from file')}</div>`,
    })}</section>`;
  } else {
    const scopes = [['all', 'All'], ['squad', 'Our squad'], ['external', 'External']];
    body = `<div class="toolbar">
      <label class="search" for="db-q">${icon('search')}<span class="sr-only">Search players</span><input id="db-q" class="input" type="search" data-input="db-search" placeholder="Search name, club, nationality" value="${esc(state.db.q)}" autocomplete="off"></label>
      ${UI.select({ id: 'db-pos', change: 'db-pos', value: state.db.pos, ariaLabel: 'Position', options: [{ value: '', label: 'All positions' }, ...PLAYER_POSITIONS.map((x) => ({ value: x.id, label: `${x.id} · ${x.label}` }))] })}
      ${UI.select({ id: 'db-status', change: 'db-status', value: state.db.status, ariaLabel: 'Internal status', options: [{ value: '', label: 'All statuses' }, ...INTERNAL_STATUS.map((x) => ({ value: x.id, label: x.id === 'monitoring' ? 'Monitoring (watchlist)' : x.label })), { value: 'closed', label: 'Not for us' }] })}
      <div class="seg" role="group" aria-label="Show">${scopes.map(([v, l]) => `<button type="button" class="seg__btn${state.db.scope === v ? ' is-active' : ''}" aria-pressed="${state.db.scope === v}" data-action="db-scope" data-id="${v}">${l}</button>`).join('')}</div>
    </div>
    <section class="panel" id="db-results">${dbResults()}</section>`;
  }
  return `<div class="page">
    ${UI.pageHeader({ title: 'Player Database', meta: saveStateNote(), actions: all.length ? importBtn('Import') + addBtn('New player') : '' })}
    ${body}
  </div>`;
}

/* ---- 6e. First Team (our squad this season) ---- */
function renderFirstTeam() {
  const rows = SquadStore.list().map((m) => ({ m, p: PlayerStore.get(m.playerId) })).filter((x) => x.p);
  const addBtn = (label) => UI.btn({ label, iconName: 'plus', variant: 'primary', action: 'squad-new' });
  const importBtn = (label) => UI.btn({ label, iconName: 'upload', action: 'import-open', data: { 'data-squad': '1' } });
  const header = UI.pageHeader({
    title: 'First Team',
    meta: UI.squadTag() + saveStateNote(),
    actions: rows.length ? importBtn('Import') + addBtn('Add player') : '',
  });
  if (!rows.length) {
    const loading = SquadStore.status() === 'connecting' || PlayerStore.status() === 'connecting';
    return `<div class="page">${header}<section class="panel">${loading ? '<div class="loading">Loading squad…</div>' : UI.emptyState({
      size: 'lg', iconName: 'shirt', title: `No players in the ${SEASON.label} squad yet`,
      text: 'Add each player in this season’s squad, or import the whole squad from Excel or CSV.',
      action: `<div class="empty__actions">${addBtn('Add player')}${importBtn('Import squad from file')}</div>`,
    })}</section></div>`;
  }

  const ages = rows.map(({ p }) => playerAge(p)).filter(has);
  const avgAge = ages.length ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1) : null;
  const expiring = rows.filter(({ p }) => expiresThisSeason(p)).length;
  const unavailable = rows.filter(({ m }) => m.status === 'injured' || m.status === 'suspended').length;
  const onLoan = rows.filter(({ m }) => m.status === 'loan').length;
  const stats = `<div class="stat-row">
    <span><b>${rows.length}</b>players</span>
    <span><b>${avgAge ?? EMPTY}</b>average age</span>
    <span><b>${expiring}</b>contracts end by ${esc(fmtDate(SEASON.end))}</span>
    <span><b>${unavailable}</b>unavailable</span>
    ${onLoan ? `<span><b>${onLoan}</b>on loan</span>` : ''}
  </div>`;

  const groupOf = (p) => (PLAYER_POSITION[p.position] ? PLAYER_POSITION[p.position].group : 'none');
  const order = (a, b) => ((PLAYER_POSITION[a.p.position]?.order ?? 99) - (PLAYER_POSITION[b.p.position]?.order ?? 99))
    || ((a.m.shirtNumber ?? 999) - (b.m.shirtNumber ?? 999)) || a.p.name.localeCompare(b.p.name);
  const body = POSITION_GROUPS.map((g) => {
    const list = rows.filter(({ p }) => groupOf(p) === g.id).sort(order);
    if (!list.length) return '';
    return `<tr class="group-row"><th colspan="8" scope="colgroup">${esc(g.label)}<span>${list.length}</span></th></tr>` + list.map(({ m, p }) => {
      const [label, tone] = VOCAB.squadStatus[m.status];
      const end = p.contract.endDate;
      return `<tr class="is-clickable" data-action="open-player" data-id="${esc(p.id)}">
        <td><span class="marker marker--squad marker--sm">${m.shirtNumber ?? EMPTY}</span></td>
        <td>${playerNameCell(p, p.nationality || '')}</td>
        <td>${p.position ? `<span class="pos" title="${esc(posLabel(p.position))}">${esc(p.position)}</span>${p.secondaryPositions.length ? `<span class="faint small">${esc(p.secondaryPositions.join(', '))}</span>` : ''}` : `<span class="faint">${EMPTY}</span>`}</td>
        <td class="ta-r num">${has(playerAge(p)) ? playerAge(p) : `<span class="faint">${EMPTY}</span>`}</td>
        <td>${p.foot ? esc(footLabel(p.foot)) : `<span class="faint">${EMPTY}</span>`}</td>
        <td>${end ? (expiresThisSeason(p) ? UI.status(fmtDate(end), 'warning') : esc(fmtDate(end))) : `<span class="faint">${EMPTY}</span>`}</td>
        <td>${UI.status(label, tone)}</td>
        <td class="ta-r">${UI.editButton('squad-edit', 'Squad details', { 'data-id': p.id })}</td>
      </tr>`;
    }).join('');
  }).join('');

  const table = `<section class="panel"><div class="table-wrap"><table class="table"><caption class="sr-only">${esc(SEASON.label)} squad by position group</caption>
    <thead><tr><th scope="col" style="width:44px">#</th><th scope="col">Player</th><th scope="col">Position</th><th scope="col" class="ta-r">Age</th><th scope="col">Foot</th><th scope="col">Contract until</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${body}</tbody></table></div></section>`;
  return `<div class="page">${header}${stats}${table}</div>`;
}

/* ---- 6f. Recruitment Needs ---- */
const needLabel = (n) => (n.position ? `${n.position} · ${posLabel(n.position)}` : 'Position not set');
const isActiveNeed = (n) => n.status === 'open' || n.status === 'progress';
// Active needs first, then priority, window and status.
const needCompare = (a, b) => ((isActiveNeed(a) ? 0 : 1) - (isActiveNeed(b) ? 0 : 1))
  || (PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority])
  || (NEED_WINDOW[a.window].order - NEED_WINDOW[b.window].order)
  || (NEED_STATUS_ORDER[a.status] - NEED_STATUS_ORDER[b.status])
  || String(a.createdAt).localeCompare(String(b.createdAt));
const seasonNeeds = () => NeedStore.list().filter((n) => n.season === SEASON.id);
const needsForPlayer = (id) => seasonNeeds().filter((n) => n.candidates.some((c) => c.playerId === id));
const needStatusChip = (n) => { const [l, t] = VOCAB.needStatus[n.status]; return UI.status(l, t); };
const needSub = (n) => [n.profile, n.reasons.map((r) => NEED_REASON[r].label).join(', ')].filter(Boolean).join(' · ');

// Squad depth by natural position, from the season squad.
function squadDepth() {
  const members = SquadStore.list().map((m) => ({ m, p: PlayerStore.get(m.playerId) })).filter((x) => x.p);
  const active = seasonNeeds().filter(isActiveNeed);
  const codes = [...new Set([...CORE_POSITIONS, ...members.map(({ p }) => p.position).filter((c) => PLAYER_POSITION[c])])]
    .sort((a, b) => PLAYER_POSITION[a].order - PLAYER_POSITION[b].order);
  return codes.map((pos) => {
    const here = members.filter(({ p }) => p.position === pos);
    const ages = here.map(({ p }) => playerAge(p)).filter(has);
    return {
      pos,
      players: here,
      also: members.filter(({ p }) => p.position !== pos && p.secondaryPositions.includes(pos)),
      avgAge: ages.length ? ages.reduce((a, b) => a + b, 0) / ages.length : null,
      ending: here.filter(({ p }) => expiresThisSeason(p)).length,
      openNeeds: active.filter((n) => n.position === pos).length,
    };
  });
}

function depthPanel() {
  const rows = squadDepth();
  const hasSquad = rows.some((r) => r.players.length);
  const body = !hasSquad
    ? UI.emptyState({ iconName: 'shirt', title: 'No squad loaded', text: `Add the ${SEASON.label} squad in First Team to see depth by position.`, action: `<div class="empty__actions">${UI.linkMore('First Team', 'squad-first-team')}</div>` })
    : `<div class="panel__body panel__body--flush"><div class="table-wrap"><table class="table depth-table"><caption class="sr-only">Squad depth by position</caption>
      <thead><tr><th scope="col">Pos</th><th scope="col" class="ta-r">Players</th><th scope="col" class="ta-r" title="Squad players who list this as a secondary position">Also</th><th scope="col" class="ta-r" title="Contracts ending by ${esc(fmtDate(SEASON.end))}">Ending</th><th scope="col" class="ta-r">Avg age</th><th scope="col" class="ta-r">Needs</th><th scope="col"><span class="sr-only">New need</span></th></tr></thead>
      <tbody>${rows.map((r) => `<tr>
        <td><span class="pos" title="${esc(posLabel(r.pos))}">${r.pos}</span></td>
        <td class="ta-r num" title="${esc(r.players.map(({ p }) => p.name).join(', '))}">${r.players.length <= 1 ? `<span class="depth-low">${r.players.length}</span>` : `<span class="cell-strong">${r.players.length}</span>`}</td>
        <td class="ta-r num" title="${esc(r.also.map(({ p }) => p.name).join(', '))}">${r.also.length || `<span class="faint">0</span>`}</td>
        <td class="ta-r num">${r.ending ? `<span class="depth-low">${r.ending}</span>` : `<span class="faint">0</span>`}</td>
        <td class="ta-r num">${r.avgAge !== null ? r.avgAge.toFixed(1) : `<span class="faint">${EMPTY}</span>`}</td>
        <td class="ta-r num">${r.openNeeds ? `<span class="cell-strong">${r.openNeeds}</span>` : `<span class="faint">0</span>`}</td>
        <td class="ta-r"><button ${attrs({ type: 'button', class: 'icon-btn icon-btn--sm', 'data-action': 'need-new', 'data-pos': r.pos, 'aria-label': `New need for ${posLabel(r.pos)}`, title: `New need for ${posLabel(r.pos)}` })}>${icon('plus')}</button></td>
      </tr>`).join('')}</tbody></table></div></div>`;
  return `<section class="panel span-5"><div class="panel__head"><div class="panel__heading"><h2 class="panel__title">Squad by position</h2><span class="panel__meta">${esc(SEASON.label)}</span></div>${hasSquad ? UI.linkMore('First Team', 'squad-first-team') : ''}</div>${body}</section>`;
}

function needsTable(list, { compact = false } = {}) {
  return `<div class="table-wrap"><table class="table"><caption class="sr-only">Recruitment needs</caption>
    <thead><tr><th scope="col">Priority</th><th scope="col">Need</th><th scope="col">Window</th><th scope="col" class="ta-r">Candidates</th>${compact ? '' : '<th scope="col">Status</th>'}</tr></thead>
    <tbody>${list.map((n) => `<tr class="is-clickable" data-action="need-goto" data-id="${esc(n.id)}">
      <td>${UI.priority(n.priority)}</td>
      <td class="wrap"><button type="button" class="row-link cell-strong" data-action="need-goto" data-id="${esc(n.id)}">${esc(needLabel(n))}</button>${needSub(n) ? `<span class="cell-sub">${esc(needSub(n))}</span>` : ''}</td>
      <td>${esc(NEED_WINDOW[n.window].label)}</td>
      <td class="ta-r num">${n.candidates.length ? `<span class="cell-strong">${n.candidates.length}</span>` : '<span class="faint">0</span>'}</td>
      ${compact ? '' : `<td>${needStatusChip(n)}</td>`}
    </tr>`).join('')}</tbody></table></div>`;
}

function renderNeeds() {
  const selected = state.needs.selected && NeedStore.get(state.needs.selected);
  if (selected) return renderNeedDetail(selected);
  state.needs.selected = null;
  const needs = seasonNeeds();
  const newBtn = UI.btn({ label: 'New need', iconName: 'plus', variant: 'primary', action: 'need-new' });
  const shown = needs.filter((n) => state.needs.scope === 'all' || isActiveNeed(n)).sort(needCompare);
  const scopes = [['active', 'Active'], ['all', 'All']];
  const seg = `<div class="seg" role="group" aria-label="Show">${scopes.map(([v, l]) => `<button type="button" class="seg__btn${state.needs.scope === v ? ' is-active' : ''}" aria-pressed="${state.needs.scope === v}" data-action="needs-scope" data-id="${v}">${l}</button>`).join('')}</div>`;
  let list;
  if (!needs.length && NeedStore.status() === 'connecting') list = '<div class="loading">Loading needs…</div>';
  else if (!needs.length) list = UI.emptyState({ iconName: 'target', title: 'No recruitment needs yet', text: 'Record each position to strengthen. Squad depth by position helps decide where.', action: newBtn });
  else if (!shown.length) list = `<div class="panel__body">${UI.emptyState({ size: 'sm', iconName: 'check', title: 'No active needs', text: 'Choose All to see filled and cancelled needs.' })}</div>`;
  else list = `<div class="panel__body panel__body--flush">${needsTable(shown)}</div>`;
  const needsPanel = `<section class="panel span-7"><div class="panel__head"><div class="panel__heading"><h2 class="panel__title">Needs</h2><span class="panel__meta">${needs.filter(isActiveNeed).length} active</span></div>${needs.length ? seg : ''}</div>${list}</section>`;
  return `<div class="page">
    ${UI.pageHeader({ title: 'Recruitment Needs', meta: saveStateNote(), actions: needs.length ? newBtn : '' })}
    <div class="grid">${can('squad.view') ? needsPanel + depthPanel() : needsPanel.replace('class="panel span-7"', 'class="panel span-12"')}</div>
  </div>`;
}

function playerLine(p, sub, { link = true } = {}) {
  const name = link
    ? `<button type="button" class="row-link cell-strong" data-action="open-player" data-id="${esc(p.id)}">${esc(p.name)}</button>`
    : `<span class="cell-strong">${esc(p.name)}</span>`;
  return `<div class="name-cell"><span class="avatar avatar--sm" aria-hidden="true">${esc(initials(p.name))}</span><div style="min-width:0">${name}${sub ? `<span class="cell-sub">${esc(sub)}</span>` : ''}</div></div>`;
}
const playerFacts = (p) => [p.position, clubOf(p), has(playerAge(p)) ? `${playerAge(p)} y` : '', p.nationality].filter(Boolean).join(' · ');

function renderNeedDetail(n) {
  const candidates = n.candidates.map((c) => ({ c, p: PlayerStore.get(c.playerId) })).filter((x) => x.p);
  const taken = new Set(candidates.map(({ p }) => p.id));
  const statusItems = Object.keys(VOCAB.needStatus).filter((s) => s !== n.status)
    .map((s) => ({ label: `Mark as ${VOCAB.needStatus[s][0].toLowerCase()}`, icon: { open: 'target', progress: 'arrow', filled: 'check', cancelled: 'x' }[s], action: 'need-status', data: { 'data-status': s } }));
  const actions = UI.btn({ label: 'Edit', iconName: 'edit', action: 'need-edit' })
    + UI.menu({ id: 'need-menu', label: 'Need actions', items: [...statusItems, { sep: true }, { label: 'Delete need', icon: 'trash', action: 'need-delete', danger: true }] });

  const header = `<header class="page-head">
    <div class="page-head__main">
      <button type="button" class="link-back" data-action="need-back">${icon('back')}All needs</button>
      <h1 class="page-title">${esc(needLabel(n))}</h1>
      ${n.profile ? `<p class="page-desc" translate="no">${esc(n.profile)}</p>` : ''}
      <div class="page-meta">${UI.priority(n.priority)}${needStatusChip(n)}<span class="pill">${icon('calendar')}${esc(NEED_WINDOW[n.window].label)}</span></div>
    </div>
    <div class="page-head__actions">${actions}</div>
  </header>`;

  const candList = candidates.length
    ? `<ul class="cand-list">${candidates.map(({ p }) => {
      const lr = latestReport(p.id);
      const missing = hasFullReport(p.id) ? '' : `<button ${attrs({ type: 'button', class: 'chip-btn', 'data-action': 'report-for', 'data-player': p.id, 'data-need': n.id, title: 'A candidate needs a full report. Write it now.' })}>${icon('alert')}Full report missing</button>`;
      return `<li>${playerLine(p, playerFacts(p))}<span class="cand-meta">${levelBadge(lr)}${lr ? recChip(lr.recommendation) : ''}${missing}</span>
        <button ${attrs({ type: 'button', class: 'icon-btn icon-btn--sm', 'data-action': 'need-remove-candidate', 'data-player': p.id, 'aria-label': `Remove ${p.name}`, title: 'Remove candidate' })}>${icon('x')}</button></li>`;
    }).join('')}</ul>`
    : `<div class="panel__body">${UI.emptyState({ size: 'sm', iconName: 'player', title: 'No candidates yet', text: 'Add players from the Player Database, or from a profile with More actions › Link to a need.' })}</div>`;

  // Options already placed in shadow teams for this position
  const fits = SLOT_FIT[n.position] || [];
  const options = [];
  ShadowTeamStore.list().forEach((t) => t.entries.forEach((e) => {
    const p = PlayerStore.get(e.playerId);
    if (p && fits.includes(e.positionId) && !taken.has(p.id) && !options.some((o) => o.p.id === p.id)) options.push({ p, where: `${t.name} · ${e.positionId}` });
  }));
  const shadowBlock = options.length ? `<details class="acc acc--panel" open>
      <summary>${icon('shadow')}<span>In shadow teams</span><span class="acc__count">${options.length}</span>${icon('chevron', 'chev')}</summary>
      <ul class="cand-list cand-list--sub">${options.map(({ p, where }) => `<li>${playerLine(p, where)}${UI.btn({ label: 'Add', iconName: 'plus', action: 'need-pick', data: { 'data-player': p.id }, cls: 'btn--sm' })}</li>`).join('')}</ul>
    </details>` : '';

  const candPanel = `<section class="panel span-7">
    <div class="panel__head"><div class="panel__heading"><h2 class="panel__title">Candidates</h2><span class="panel__meta">${candidates.length}</span></div>${UI.btn({ label: 'Add candidate', iconName: 'plus', action: 'need-add-candidate', cls: 'btn--sm' })}</div>
    ${candList}
    ${shadowBlock}
  </section>`;

  const related = n.relatedPlayerId ? PlayerStore.get(n.relatedPlayerId) : null;
  const ages = n.ageMin !== null || n.ageMax !== null ? `${n.ageMin ?? '…'}–${n.ageMax ?? '…'}` : null;
  const details = UI.kv([
    ['Deal type', DEAL_TYPES[n.dealType]],
    ['Age range', ages],
    ['Related squad player', related ? related.name : null],
  ]);
  const reasons = n.reasons.length ? `<div class="chip-row">${n.reasons.map((r) => `<span class="chip">${esc(NEED_REASON[r].label)}</span>`).join('')}</div>` : `<p class="faint">No reasons recorded.</p>`;
  const inSquad = SquadStore.list().map((m) => ({ m, p: PlayerStore.get(m.playerId) }))
    .filter(({ p }) => p && n.position && (p.position === n.position || p.secondaryPositions.includes(n.position)))
    .sort((a, b) => (a.p.position === n.position ? 0 : 1) - (b.p.position === n.position ? 0 : 1) || a.p.name.localeCompare(b.p.name));
  const squadList = inSquad.length
    ? `<ul class="squad-mini">${inSquad.map(({ m, p }) => {
      const [label, tone] = VOCAB.squadStatus[m.status];
      const end = p.contract.endDate ? `until ${fmtDate(p.contract.endDate)}` : 'contract end not set';
      return `<li><span class="marker marker--squad marker--sm">${m.shirtNumber ?? EMPTY}</span>${playerLine(p, `${p.position === n.position ? '' : `Also plays ${n.position} · `}${end}`)}${m.status !== 'available' ? UI.status(label, tone) : ''}${expiresThisSeason(p) ? UI.status('Ends this season', 'warning') : ''}</li>`;
    }).join('')}</ul>`
    : `<p class="faint">No squad players at this position.</p>`;

  const infoPanel = `<section class="panel span-5">
    <div class="panel__section">${UI.sectionTitle('Reasons')}${reasons}</div>
    <div class="panel__section">${UI.sectionTitle('Details')}${details}${n.notes ? `<p class="need-notes" translate="no">${esc(n.notes)}</p>` : ''}</div>
    <div class="panel__section">${UI.sectionTitle(`${CLUB.name} at ${n.position || 'this position'}`)}${squadList}</div>
  </section>`;

  return `<div class="page">${header}<div class="grid">${candPanel}${infoPanel}</div></div>`;
}

/* ---- 6i. Scouting ---- */
const reportsFor = (playerId) => visibleReports().filter((r) => r.playerId === playerId);
const latestReport = (playerId) => reportsFor(playerId)[0] || null;
const hasFullReport = (playerId) => reportsFor(playerId).some((r) => r.type === 'full');
const recChip = (id) => { const r = RECOMMENDATION[id]; return r ? UI.status(r.label, r.tone) : ''; };
const typeChip = (t) => `<span class="chip chip--sm">${t === 'full' ? 'Full' : 'Quick'}</span>`;
const prefs = {
  get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
};

// "3 → 4": current level and potential, with the scale labels on hover.
function levelBadge(r) {
  if (!r || r.levelNow === null) return `<span class="faint">${EMPTY}</span>`;
  const title = `Current ${r.levelNow} · ${levelLabel(r.levelNow)}${r.levelPotential ? ` — Potential ${r.levelPotential} · ${levelLabel(r.levelPotential)}` : ''}`;
  return `<span class="lvl" title="${esc(title)}"><b>${r.levelNow}</b>${r.levelPotential ? `<span>→ ${r.levelPotential}</span>` : ''}</span>`;
}
function gradeDots(score) {
  return `<span class="grade" title="${esc(`${score} · ${gradeLabel(score)}`)}">${[1, 2, 3, 4].map((i) => `<i${i <= score ? ' class="on"' : ''}></i>`).join('')}<span>${esc(gradeLabel(score))}</span></span>`;
}

function reportDetailHtml(r, { actions = true } = {}) {
  const need = r.needId ? NeedStore.get(r.needId) : null;
  const context = [fmtDate(r.date), VENUES[r.venue], r.match, r.competition, r.positionPlayed ? `played ${r.positionPlayed}` : '', r.minutes !== null ? `${r.minutes} min` : ''].filter(Boolean).join(' · ');
  const rows = (list) => list.map(([label, score]) => `<div class="grade-line"><span>${esc(label)}</span>${gradeDots(score)}</div>`).join('');
  const dims = DIMENSIONS.filter((d) => r.dimensions[d.id] !== null).map((d) => [d.label, r.dimensions[d.id]]);
  const attrs = r.attributes.map((a) => [a.name, a.score]);
  const list = (items) => `<ul class="bullets" translate="no">${items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>`;
  return `<div class="report">
    <p class="report__context">${esc(context)}${showAuthors() ? ` · ${esc(authorName(r.authorId, r.scout))}` : ''}</p>
    <div class="report__levels">
      <div><span class="report__k">Current level</span><span class="report__v"><b>${r.levelNow ?? EMPTY}</b> ${esc(levelLabel(r.levelNow))}</span></div>
      <div><span class="report__k">Potential</span><span class="report__v"><b>${r.levelPotential ?? EMPTY}</b> ${esc(levelLabel(r.levelPotential))}</span></div>
      <div><span class="report__k">Recommendation</span><span class="report__v">${recChip(r.recommendation)}${r.recommendation === 'no' && r.closeReason ? ` <span class="muted small">${esc(CLOSE_REASONS[r.closeReason])}</span>` : ''}</span></div>
    </div>
    ${r.summary ? `<p class="report__summary" translate="no">${esc(r.summary)}</p>` : ''}
    ${r.type === 'full' && (dims.length || attrs.length) ? `<div class="report__grades">${dims.length ? `<div>${UI.sectionTitle('Dimensions')}${rows(dims)}</div>` : ''}${attrs.length ? `<div>${UI.sectionTitle(`Attributes${r.positionPlayed ? ` · ${r.positionPlayed}` : ''}`)}${rows(attrs)}</div>` : ''}</div>` : ''}
    ${r.strengths.length || r.concerns.length ? `<div class="report__grades"><div>${UI.sectionTitle('Strengths')}${r.strengths.length ? list(r.strengths) : '<p class="faint">None recorded.</p>'}</div><div>${UI.sectionTitle('Concerns')}${r.concerns.length ? list(r.concerns) : '<p class="faint">None recorded.</p>'}</div></div>` : ''}
    ${need ? `<p class="report__need">${icon('target')}Linked need: <button type="button" class="row-link" data-action="need-goto" data-id="${esc(need.id)}">${esc(needLabel(need))}</button></p>` : ''}
    ${actions ? `<div class="report__actions">${UI.btn({ label: 'Edit', iconName: 'edit', variant: 'ghost', action: 'report-edit', data: { 'data-id': r.id }, cls: 'btn--sm' })}${UI.btn({ label: 'Delete', iconName: 'trash', variant: 'ghost', action: 'report-delete', data: { 'data-id': r.id }, cls: 'btn--sm' })}</div>` : ''}
  </div>`;
}

// Player Profile › Scouting
function profileScouting(p) {
  if (!p) {
    return `<section class="panel"><div class="split">
        <div class="panel__section">${UI.sectionTitle('Summary')}${UI.kv([['Reports', null], ...(showAuthors() ? [['Scouts', null]] : []), ['Last observed', null]])}</div>
        <div class="panel__section">${UI.sectionTitle('Latest level')}<div class="rec is-empty">No reports yet</div></div>
      </div></section>`;
  }
  const reports = reportsFor(p.id);
  const actions = `<div class="toolbar">${UI.btn({ label: 'Quick report', iconName: 'plus', action: 'report-new', data: { 'data-type': 'quick' } })}${UI.btn({ label: 'Full report', iconName: 'plus', variant: 'primary', action: 'report-new', data: { 'data-type': 'full' } })}<span class="toolbar__note">Level scale 1–5 · <a href="#scouting-criteria" data-route="scouting-criteria">Evaluation criteria</a></span></div>`;
  if (!reports.length) {
    return `${actions}<section class="panel">${UI.emptyState({ iconName: 'eye', title: 'No reports yet', text: 'Start with a quick report after a first observation. A full report is required once the player is a candidate for a need.' })}</section>`;
  }
  const latest = reports[0];
  const full = reports.filter((r) => r.type === 'full').length;
  const scouts = [...new Set(reports.map((r) => authorName(r.authorId, r.scout)))];
  const nowLevels = reports.map((r) => r.levelNow).filter((x) => x !== null);
  const avg = nowLevels.length ? (nowLevels.reduce((a, b) => a + b, 0) / nowLevels.length).toFixed(1) : null;
  const summary = `<section class="panel"><div class="split">
      <div class="panel__section">${UI.sectionTitle('Summary')}${UI.kv([
        ['Reports', `${reports.length} · ${full} full`],
        ...(showAuthors() ? [['Scouts', scouts.join(', ') || null]] : []),
        ['Last observed', fmtDate(latest.date)],
        ['Seen live', String(reports.filter((r) => r.venue === 'live').length)],
      ])}</div>
      <div class="panel__section">${UI.sectionTitle('Latest level')}
        <div class="big-level">${levelBadge(latest)}<div><div class="cell-strong">${esc(levelLabel(latest.levelNow))}</div><div class="cell-sub">Potential: ${esc(levelLabel(latest.levelPotential) || EMPTY)}</div></div></div>
        <div class="kv-inline"><span>Average current level <b>${avg ?? EMPTY}</b> <span class="faint">(${nowLevels.length} report${nowLevels.length === 1 ? '' : 's'})</span></span><span>Latest recommendation ${recChip(latest.recommendation)}</span></div>
      </div>
    </div></section>`;
  const list = `<section class="panel">${reports.map((r, i) => `<details class="acc"${i === 0 ? ' open' : ''}>
      <summary><span class="report-sum"><span class="num">${esc(fmtDate(r.date))}</span>${typeChip(r.type)}${levelBadge(r)}${recChip(r.recommendation)}${showAuthors() ? `<span class="faint">${esc(authorName(r.authorId, r.scout))}</span>` : ''}</span>${icon('chevron', 'chev')}</summary>
      <div class="acc__body">${reportDetailHtml(r)}</div>
    </details>`).join('')}</section>`;
  const fullReports = reports.filter((r) => r.strengths.length || r.concerns.length);
  const sc = fullReports.length ? `<section class="panel"><div class="split">
      <div class="panel__section">${UI.sectionTitle('Strengths')}<ul class="bullets">${fullReports.flatMap((r) => r.strengths.map((s) => `<li><span translate="no">${esc(s)}</span> <span class="faint small">${esc(fmtDate(r.date))}</span></li>`)).join('') || '<li class="faint">None recorded</li>'}</ul></div>
      <div class="panel__section">${UI.sectionTitle('Concerns')}<ul class="bullets">${fullReports.flatMap((r) => r.concerns.map((s) => `<li><span translate="no">${esc(s)}</span> <span class="faint small">${esc(fmtDate(r.date))}</span></li>`)).join('') || '<li class="faint">None recorded</li>'}</ul></div>
    </div></section>` : '';
  return `${actions}${summary}${list}${sc}`;
}
PROFILE_VIEWS.scouting = profileScouting;

// Scouting › Observation Reports
function filteredReports() {
  const q = normText(state.reports.q.trim());
  return visibleReports().filter((r) => {
    if (state.reports.type && r.type !== state.reports.type) return false;
    if (state.reports.rec && r.recommendation !== state.reports.rec) return false;
    if (!q) return true;
    const p = PlayerStore.get(r.playerId);
    return [p && p.name, r.scout, r.match, r.competition].some((x) => normText(x).includes(q));
  });
}
function reportsResults() {
  const rows = filteredReports();
  const total = visibleReports().length;
  const head = `<div class="panel__head"><div class="panel__heading"><h2 class="panel__title">Reports</h2><span class="panel__meta">${rows.length === total ? total : `${rows.length} of ${total}`}</span></div></div>`;
  if (!rows.length) return `${head}<div class="panel__body">${UI.emptyState({ size: 'sm', iconName: 'search', title: 'No reports match these filters' })}</div>`;
  return `${head}<div class="table-wrap"><table class="table"><caption class="sr-only">Observation reports</caption>
    <thead><tr><th scope="col">Date</th><th scope="col">Player</th><th scope="col">Type</th><th scope="col">Level</th><th scope="col">Recommendation</th>${showAuthors() ? '<th scope="col">Scout</th>' : ''}<th scope="col">Need</th></tr></thead>
    <tbody>${rows.map((r) => {
      const p = PlayerStore.get(r.playerId);
      const need = r.needId ? NeedStore.get(r.needId) : null;
      return `<tr class="is-clickable" data-action="report-view" data-id="${esc(r.id)}">
        <td class="num">${esc(fmtDate(r.date))}</td>
        <td><button type="button" class="row-link cell-strong" data-action="report-view" data-id="${esc(r.id)}">${esc(p ? p.name : 'Player unavailable')}</button><span class="cell-sub">${esc(p ? [p.position, clubOf(p)].filter(Boolean).join(' · ') : '')}</span></td>
        <td>${typeChip(r.type)}</td>
        <td>${levelBadge(r)}</td>
        <td>${recChip(r.recommendation)}</td>
        ${showAuthors() ? `<td>${esc(authorName(r.authorId, r.scout))}</td>` : ''}
        <td>${need ? esc(need.position) : `<span class="faint">${EMPTY}</span>`}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
}
function renderReports() {
  const newBtn = UI.btn({ label: 'New report', iconName: 'plus', variant: 'primary', action: 'report-pick' });
  const all = visibleReports();
  let body;
  if (!all.length && ReportStore.status() === 'connecting') body = '<section class="panel"><div class="loading">Loading reports…</div></section>';
  else if (!all.length) body = `<section class="panel">${UI.emptyState({ size: 'lg', iconName: 'eye', title: 'No reports yet', text: 'Write the first report here, or with Scout Player on a player’s profile.', action: newBtn })}</section>`;
  else {
    body = `<div class="toolbar">
      <label class="search" for="rep-q">${icon('search')}<span class="sr-only">Search reports</span><input id="rep-q" class="input" type="search" data-input="rep-search" placeholder="Search player, match, competition" value="${esc(state.reports.q)}" autocomplete="off"></label>
      ${UI.select({ id: 'rep-type', change: 'rep-type', value: state.reports.type, ariaLabel: 'Type', options: [{ value: '', label: 'All types' }, { value: 'quick', label: 'Quick' }, { value: 'full', label: 'Full' }] })}
      ${UI.select({ id: 'rep-rec', change: 'rep-rec', value: state.reports.rec, ariaLabel: 'Recommendation', options: [{ value: '', label: 'All recommendations' }, ...RECOMMENDATIONS.map((r) => ({ value: r.id, label: r.label }))] })}
    </div>
    <section class="panel" id="rep-results">${reportsResults()}</section>`;
  }
  return `<div class="page">${UI.pageHeader({ title: 'Observation Reports', meta: saveStateNote(), actions: all.length ? newBtn : '' })}${body}</div>`;
}

// The Scout column appears once assignments go to someone other than the viewer.
const showScoutColumn = (list) => showAuthors() || list.some((r) => (r.assigneeId ? r.assigneeId !== Viewer.id : !!r.scout));
// Scouting › Assignments (observation requests). Each person sees their own; with "View everyone’s assignments", all.
function renderAssignments() {
  const all = visibleRequests();
  const newBtn = UI.btn({ label: 'New assignment', iconName: 'plus', variant: 'primary', action: 'request-pick' });
  const shown = all.filter((r) => state.requests.scope === 'all' || r.status === 'open');
  const today = todayIso();
  const seg = `<div class="seg" role="group" aria-label="Show">${[['open', 'Open'], ['all', 'All']].map(([v, l]) => `<button type="button" class="seg__btn${state.requests.scope === v ? ' is-active' : ''}" aria-pressed="${state.requests.scope === v}" data-action="requests-scope" data-id="${v}">${l}</button>`).join('')}</div>`;
  let list;
  if (!all.length && RequestStore.status() === 'connecting') list = '<div class="loading">Loading…</div>';
  else if (!all.length) list = UI.emptyState({ iconName: 'calendar', title: 'No assignments yet', text: 'Players to watch appear here. A report that recommends “See again” creates one too.', action: newBtn });
  else if (!shown.length) list = `<div class="panel__body">${UI.emptyState({ size: 'sm', iconName: 'check', title: 'No open assignments' })}</div>`;
  else {
    const scoutCol = showScoutColumn(all);
    list = `<div class="table-wrap"><table class="table"><caption class="sr-only">Assignments</caption>
      <thead><tr><th scope="col">Watch by</th><th scope="col">Player</th>${scoutCol ? '<th scope="col">Scout</th>' : ''}<th scope="col">Match</th><th scope="col">Status</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
      <tbody>${shown.map((r) => {
        const p = PlayerStore.get(r.playerId);
        const [sl, st] = VOCAB.requestStatus[r.status];
        const overdue = r.status === 'open' && r.dueBy && r.dueBy < today;
        const d = { 'data-id': r.id };
        return `<tr>
          <td>${r.dueBy ? (overdue ? UI.status(fmtDate(r.dueBy), 'warning') : `<span class="num">${esc(fmtDate(r.dueBy))}</span>`) : `<span class="faint">${EMPTY}</span>`}</td>
          <td class="wrap">${p ? `<button type="button" class="row-link cell-strong" data-action="open-player" data-id="${esc(p.id)}">${esc(p.name)}</button>` : 'Player unavailable'}${r.note ? `<span class="cell-sub" translate="no">${esc(r.note)}</span>` : ''}</td>
          ${scoutCol ? `<td>${esc(authorName(r.assigneeId, r.scout))}</td>` : ''}
          <td>${r.match ? esc(r.match) : `<span class="faint">${EMPTY}</span>`}</td>
          <td>${UI.status(sl, st)}</td>
          <td class="ta-r"><div class="row-actions">
            ${r.status === 'open' ? UI.btn({ label: 'Done', iconName: 'check', action: 'request-status', data: { ...d, 'data-status': 'done' }, cls: 'btn--sm' }) : ''}
            ${UI.menu({ id: `req-menu-${r.id}`, label: 'Observation actions', items: [
              ...(r.status === 'open' && p ? [{ label: 'Write report', icon: 'note', action: 'request-report', data: d }] : []),
              { label: 'Edit', icon: 'edit', action: 'request-edit', data: d },
              ...(r.status === 'open' ? [{ label: 'Cancel', icon: 'x', action: 'request-status', data: { ...d, 'data-status': 'cancelled' } }] : [{ label: 'Reopen', icon: 'arrow', action: 'request-status', data: { ...d, 'data-status': 'open' } }]),
              { sep: true },
              { label: 'Delete', icon: 'trash', action: 'request-delete', data: d, danger: true },
            ] })}
          </div></td>
        </tr>`;
      }).join('')}</tbody></table></div>`;
  }
  const open = all.filter((r) => r.status === 'open').length;
  return `<div class="page">
    ${UI.pageHeader({ title: 'Assignments', desc: 'Who watches which player, where and by when.', meta: saveStateNote(), actions: all.length ? newBtn : '' })}
    <section class="panel"><div class="panel__head"><div class="panel__heading"><h2 class="panel__title">${can('assignments.viewAll') ? 'All assignments' : 'My assignments'}</h2><span class="panel__meta">${open} open</span></div>${all.length ? seg : ''}</div>${list}</section>
  </div>`;
}

// Scouting › Evaluation Criteria
function renderCriteria() {
  const lists = evaluationAttributes();
  const levels = `<table class="table"><caption class="sr-only">Level scale</caption><tbody>${LEVELS.map((l) => `<tr><td style="width:44px"><span class="lvl"><b>${l.v}</b></span></td><td>${esc(l.label)}</td></tr>`).join('')}</tbody></table>`;
  const grades = `<table class="table"><caption class="sr-only">Grades</caption><tbody>${GRADES.map((g) => `<tr><td>${gradeDots(g.v)}</td></tr>`).join('')}</tbody></table>`;
  const groups = ATTRIBUTE_GROUPS.map((g) => `<fieldset class="crit-group" data-group="${g.id}">
      <legend><span class="cell-strong">${esc(g.label)}</span><span class="faint small">${esc(g.positions.join(', '))}</span></legend>
      <div class="crit-list" id="crit-${g.id}">${lists[g.id].map((a, i) => critRow(g.id, i, a)).join('')}</div>
      ${UI.btn({ label: 'Add attribute', iconName: 'plus', variant: 'ghost', action: 'crit-add', data: { 'data-group': g.id }, cls: 'btn--sm' })}
    </fieldset>`).join('');
  return `<div class="page">
    ${UI.pageHeader({ title: 'Evaluation Criteria', desc: 'The scales and position attributes used in every report.', meta: saveStateNote() })}
    <div class="grid">
      ${UI.panel({ cls: 'span-6', title: 'Level', meta: 'Current level and potential in 2 seasons', flush: true, body: levels })}
      ${UI.panel({ cls: 'span-6', title: 'Grades', meta: 'Dimensions and attributes · no middle point', flush: true, body: `${grades}<p class="crit-dims">Dimensions: ${DIMENSIONS.map((d) => d.label).join(', ')}</p>` })}
    </div>
    <form class="panel" data-form="criteria" novalidate>
      <div class="panel__head"><div class="panel__heading"><h2 class="panel__title">Attributes by position</h2><span class="panel__meta">${MIN_ATTRIBUTES} to ${MAX_ATTRIBUTES} per group · used in full reports</span></div>
        <div class="dlg-actions__group">${UI.btn({ label: 'Reset to defaults', variant: 'ghost', action: 'crit-reset' })}<button type="submit" class="btn btn--primary">Save criteria</button></div></div>
      <div class="panel__body"><div class="crit-grid">${groups}</div><p class="small faint" style="margin-top:12px">Changes apply to new reports. Existing reports keep the attributes they were written with.</p></div>
    </form>
  </div>`;
}
const DEFAULT_ATTRIBUTE_NAMES = [...new Set(Object.values(DEFAULT_ATTRIBUTES).flat())];
function critRow(group, i, value) {
  return `<div class="crit-row"><label class="sr-only" for="crit-${group}-${i}">Attribute ${i + 1}</label><input id="crit-${group}-${i}" class="input" name="crit_${group}" maxlength="40" value="${esc(tr(value))}" autocomplete="off"><button ${attrs({ type: 'button', class: 'icon-btn icon-btn--sm', 'data-action': 'crit-remove', 'aria-label': 'Remove attribute', title: 'Remove attribute' })}>${icon('x')}</button></div>`;
}

/* ---- 6g. Shadow Teams ---- */
const PITCH_LINES = `<svg class="st-lines" viewBox="0 0 105 68" aria-hidden="true" focusable="false">
  <rect x="0.5" y="0.5" width="104" height="67" rx="1"/>
  <line x1="52.5" y1="0.5" x2="52.5" y2="67.5"/>
  <circle cx="52.5" cy="34" r="9.15"/>
  <rect x="0.5" y="13.85" width="16.5" height="40.3"/>
  <rect x="88" y="13.85" width="16.5" height="40.3"/>
  <rect x="0.5" y="24.85" width="5.5" height="18.3"/>
  <rect x="99" y="24.85" width="5.5" height="18.3"/>
</svg>`;

const currentTeam = () => ShadowTeamStore.get(state.shadow.teamId);
const playerName = (id) => { const p = PlayerRepository.get(id); return p ? p.name : 'Player unavailable'; };

function saveStateNote() {
  if (!anyUnsaved()) return '';
  return `<span class="save-state" title="Storage is not available in this view, so changes last until the page is closed.">${icon('alert')}Not saved</span>`;
}

function renderShadowTeams() {
  const teams = ShadowTeamStore.list();
  if (teams.length && !teams.some((t) => t.id === state.shadow.teamId)) {
    state.shadow.teamId = teams[0].id;
    state.shadow.pos = null;
  }
  const team = currentTeam();
  const header = UI.pageHeader({
    title: 'Shadow Teams',
    meta: UI.shadowTag(),
    actions: team ? UI.btn({ label: 'New shadow team', iconName: 'plus', variant: 'primary', action: 'st-new' }) : '',
  });

  let body;
  if (!team && ShadowTeamStore.status() === 'connecting') {
    body = `<section class="panel"><div class="loading">Loading shadow teams…</div></section>`;
  } else if (!team) {
    body = `<section class="panel">${UI.emptyState({
      size: 'lg', iconName: 'shadow', title: 'No shadow teams yet',
      text: 'Build a parallel squad of alternatives for every position.',
      action: UI.btn({ label: 'Create shadow team', iconName: 'plus', variant: 'primary', action: 'st-new' }),
    })}</section>`;
  } else {
    body = shadowWorkspace(team, teams);
  }
  return `<div class="page">${header}${body}</div>`;
}

function shadowWorkspace(team, teams) {
  const slots = FORMATIONS[team.formation];
  const posSet = new Set(slots.map(([pos]) => pos));
  const covered = slots.filter(([pos]) => ShadowOps.list(team, pos).length).length;
  const selected = posSet.has(state.shadow.pos) ? state.shadow.pos : null;

  const bar = `<div class="st-bar">
    <div class="st-bar__group">
      ${UI.select({ id: 'st-team', change: 'st-team', value: team.id, options: teams.map((t) => ({ value: t.id, label: t.name })), ariaLabel: 'Shadow team', cls: 'select--strong' })}
      <label class="inline-field" for="st-formation"><span>Formation</span>${UI.select({ id: 'st-formation', change: 'st-formation', value: team.formation, options: FORMATION_IDS.map((f) => ({ value: f, label: f })) })}</label>
    </div>
    <div class="st-bar__group">
      ${saveStateNote()}
      <span class="st-stats">${covered} of ${slots.length} positions covered</span>
      ${UI.menu({ id: 'st-menu', label: 'Shadow team actions', items: [
        { label: 'Rename', icon: 'edit', action: 'st-rename' },
        { sep: true },
        { label: 'Delete shadow team', icon: 'trash', action: 'st-delete', danger: true },
      ] })}
    </div>
  </div>`;

  const nodes = slots.map(([pos, x, y]) => {
    const list = ShadowOps.list(team, pos);
    const on = pos === selected;
    const label = `${POSITIONS[pos]}, ${list.length} player${list.length === 1 ? '' : 's'}`;
    return `<button type="button" class="st-node${list.length ? ' has-players' : ''}${on ? ' is-selected' : ''}" style="left:${x}%;top:${y}%" data-action="st-pos" data-pos="${pos}" data-drop="node" aria-pressed="${on}" aria-label="${esc(label)}" title="${esc(POSITIONS[pos])}">
      <span class="marker marker--shadow">${pos}</span>
      ${list.length ? `<span class="st-node__count">${list.length}</span><span class="st-node__name">${esc(playerName(list[0].playerId))}</span>` : ''}
    </button>`;
  }).join('');

  const pitch = `<section class="panel st-pitch-panel"><div class="st-pitch" role="group" aria-label="Formation ${esc(team.formation)}">${PITCH_LINES}${nodes}</div></section>`;
  const side = `<section class="panel st-side">${selected ? positionDetail(team, selected) : positionsOverview(team, slots, posSet)}</section>`;
  return `${bar}<div class="st-layout">${pitch}${side}</div>`;
}

function positionsOverview(team, slots, posSet) {
  const rows = slots.map(([pos]) => {
    const list = ShadowOps.list(team, pos);
    return `<tr class="is-clickable" data-action="st-pos" data-pos="${pos}">
      <td class="wrap-cell"><button type="button" class="row-link" data-action="st-pos" data-pos="${pos}"><span class="pos">${pos}</span></button><span class="muted">${esc(POSITIONS[pos])}</span></td>
      <td class="ta-r num">${list.length ? `<span class="cell-strong">${list.length}</span>` : '<span class="faint">0</span>'}</td>
      <td class="wrap-cell">${list.length ? esc(playerName(list[0].playerId)) : `<span class="faint">${EMPTY}</span>`}</td>
    </tr>`;
  }).join('');
  const off = team.entries.filter((e) => !posSet.has(e.positionId));
  const offBlock = off.length ? `<details class="acc acc--panel">
      <summary>${icon('alert')}<span>Not in this formation</span><span class="acc__count">${off.length}</span>${icon('chevron', 'chev')}</summary>
      <div class="acc__body"><ul>${off.map((e) => `<li class="st-off">
        <span class="pos">${esc(e.positionId)}</span>
        <span class="cell-strong">${esc(playerName(e.playerId))}</span>
        ${UI.btn({ label: 'Move to position', iconName: 'arrow', variant: 'ghost', action: 'st-move-to', iconOnly: true, data: { 'data-player': e.playerId, 'data-pos': e.positionId } })}
      </li>`).join('')}</ul></div>
    </details>` : '';
  return `<div class="panel__head"><div class="panel__heading"><h2 class="panel__title">Positions</h2><span class="panel__meta">${esc(team.formation)}</span></div></div>
    <div class="table-wrap"><table class="table"><caption class="sr-only">Players listed per position</caption>
      <thead><tr><th scope="col">Position</th><th scope="col" class="ta-r">Players</th><th scope="col">First option</th></tr></thead>
      <tbody>${rows}</tbody></table></div>
    ${offBlock}`;
}

function positionDetail(team, pos) {
  const list = ShadowOps.list(team, pos);
  const entries = list.map((e, i) => {
    const p = PlayerRepository.get(e.playerId);
    const d = { 'data-player': e.playerId, 'data-pos': pos, 'data-index': String(i) };
    return `<li class="st-entry" draggable="true" data-drop="entry" data-player="${esc(e.playerId)}" data-pos="${pos}" data-index="${i}">
      <span class="st-grip" aria-hidden="true">${icon('grip')}</span>
      <span class="st-rank">${i + 1}</span>
      <div class="st-entry__main">
        <span class="cell-strong">${esc(p ? p.name : 'Player unavailable')}</span>
        <span class="cell-sub">${esc(tierLabel(i))}${p && p.club ? ` · ${esc(p.club)}` : ''}</span>
        ${e.note ? `<div class="st-note" translate="no">${esc(e.note)}</div>` : ''}
      </div>
      <div class="st-tools">
        <button ${attrs({ type: 'button', class: 'icon-btn icon-btn--sm', 'data-action': 'st-up', 'aria-label': 'Move up', title: 'Move up', disabled: i === 0, ...d })}>${icon('up')}</button>
        <button ${attrs({ type: 'button', class: 'icon-btn icon-btn--sm', 'data-action': 'st-down', 'aria-label': 'Move down', title: 'Move down', disabled: i === list.length - 1, ...d })}>${icon('down')}</button>
        <button ${attrs({ type: 'button', class: 'icon-btn icon-btn--sm', 'data-action': 'st-move-to', 'aria-label': 'Move to another position', title: 'Move to another position', ...d })}>${icon('arrow')}</button>
        <button ${attrs({ type: 'button', class: 'icon-btn icon-btn--sm', 'data-action': 'st-remove', 'aria-label': 'Remove from list', title: 'Remove from list', ...d })}>${icon('x')}</button>
      </div>
    </li>`;
  }).join('');
  let slots = '';
  for (let i = list.length; i < SHADOW_TIERS.length; i++) {
    slots += `<li class="st-slot" data-drop="slot" data-pos="${pos}" data-index="${i}"><span class="st-grip"></span><span class="st-rank">${i + 1}</span><span class="st-slot__label">${esc(tierLabel(i))}</span><span class="st-slot__empty">Empty</span></li>`;
  }
  if (list.length >= SHADOW_TIERS.length) {
    slots += `<li class="st-slot st-slot--end" data-drop="slot" data-pos="${pos}" data-index="${list.length}">Drop here to add at the end</li>`;
  }
  return `<div class="st-detail">
    <button type="button" class="link-back" data-action="st-pos" data-pos="">${icon('back')}All positions</button>
    <div class="st-detail__head">
      <span class="marker marker--shadow">${pos}</span>
      <div><h2 class="panel__title">${esc(POSITIONS[pos])}</h2><div class="small faint">${list.length} in list</div></div>
    </div>
    <ol class="st-list" aria-label="${esc(POSITIONS[pos])} options in priority order">${entries}${slots}</ol>
    <p class="st-hint">${icon('info')}<span>Add players from their profile, under More actions. Drag to reorder or onto another position.</span></p>
  </div>`;
}

/* ---- 6h. Design system reference ---- */
function dsFoundations() {
  const css = getComputedStyle(document.documentElement);
  const val = (t) => css.getPropertyValue(`--${t}`).trim();
  const groups = [
    ['Surfaces', [['bg', 'Page background'], ['bg-sidebar', 'Sidebar'], ['surface', 'Panel'], ['surface-2', 'Raised · hover'], ['surface-3', 'Control'], ['line', 'Divider'], ['line-strong', 'Border']]],
    ['Text', [['text', 'Primary'], ['text-2', 'Secondary'], ['text-3', 'Muted']]],
    ['Accent (the only highlight colour)', [['accent', 'Accent'], ['accent-strong', 'Accent text'], ['accent-soft', 'Accent wash']]],
    ['Status (reserved for state)', [['positive', 'Positive'], ['warning', 'Alert'], ['danger', 'Problem · rejected']]],
  ];
  const colours = groups.map(([group, items]) => `<div class="ds-group">
    <div class="ds-group__label">${UI.sectionTitle(group)}</div>
    <div class="swatches">${items.map(([t, label]) => `<div class="swatch"><span class="swatch__chip" style="background:var(--${t})"></span><div style="min-width:0"><div class="swatch__name">${esc(label)}</div><div class="swatch__token">--${t} · ${esc(val(t))}</div></div></div>`).join('')}</div>
  </div>`).join('');

  const type = [
    ['Page title · Display 22/600', '<span class="page-title">Shadow Teams</span>'],
    ['Section label · Display 11.5 caps', '<span class="sec-title">Current situation</span>'],
    ['Panel title · Sans 13.5/600', '<span class="panel__title">Upcoming Scout Assignments</span>'],
    ['Body · Sans 13/400', '<span>Left-footed centre-back, comfortable building from the back.</span>'],
    ['Figure · Sans 26/600', '<span class="kpi__value">214</span>'],
    ['Table header · Display 11 caps', '<span class="th-sample">Position</span>'],
    ['Meta · Mono 11', '<span class="mono">2026-09-30</span>'],
  ].map(([meta, sample]) => `<div class="type-row"><span class="type-meta">${esc(meta)}</span><div>${sample}</div></div>`).join('');

  const spacing = `<div class="space-list">${[4, 8, 12, 16, 20, 24, 32].map((n, i) => `<div class="space-item"><span class="mono">--sp-${[1, 2, 3, 4, 5, 6, 8][i]} · ${n}</span><span class="space-bar" style="width:${n * 3}px"></span></div>`).join('')}</div>`;

  return `${UI.panel({ title: 'Colour', meta: 'Current theme', body: colours })}
    <div class="grid">
      ${UI.panel({ cls: 'span-7', title: 'Typography', body: type })}
      ${UI.panel({ cls: 'span-5', title: 'Spacing', body: spacing })}
    </div>`;
}

function dsComponents() {
  const buttons = `<div class="chip-row">${UI.btn({ label: 'Primary action', variant: 'primary', iconName: 'plus', action: 'noop' })}${UI.btn({ label: 'Secondary', action: 'noop' })}${UI.btn({ label: 'Ghost', variant: 'ghost', action: 'noop' })}${UI.btn({ label: 'Delete', variant: 'danger', iconName: 'trash', action: 'noop' })}${UI.menu({ id: 'ds-menu', items: [{ label: 'Available action', icon: 'edit', action: 'noop' }, { label: 'Later action', icon: 'share', action: 'noop', inactive: true, hint: 'Later' }, { sep: true }, { label: 'Destructive action', icon: 'trash', action: 'noop', danger: true }] })}</div>`;

  const chips = `
    <div class="chip-set"><div class="chip-set__label">Squad need</div><div class="chip-row">${Object.keys(VOCAB.need).map((k) => UI.vocab('need', k)).join('')}</div></div>
    <div class="chip-set"><div class="chip-set__label">Assignment</div><div class="chip-row">${Object.keys(VOCAB.assignment).map((k) => UI.vocab('assignment', k)).join('')}</div></div>
    <div class="chip-set"><div class="chip-set__label">Priority and workflow stage</div><div class="chip-row">${['high', 'medium', 'low'].map(UI.priority).join('')}${['search', 'shortlist'].map(UI.stage).join('')}</div></div>`;

  const tabsSample = `<div class="tabs" role="presentation"><span class="tab is-active">Overview</span><span class="tab">Performance</span><span class="tab">Scouting</span><span class="tab">${icon('lock')}Contract</span></div>`;
  const accSample = `<div class="ds-frame" style="padding:0"><details class="acc"><summary>${icon('note')}<span>Reports</span><span class="acc__count">0</span>${icon('chevron', 'chev')}</summary><div class="acc__body">${UI.emptyState({ size: 'sm', iconName: 'note', title: 'No reports yet' })}</div></details><details class="acc"><summary>${icon('eye')}<span>Observations</span><span class="acc__count">0</span>${icon('chevron', 'chev')}</summary><div class="acc__body">${UI.emptyState({ size: 'sm', iconName: 'eye', title: 'No observations yet' })}</div></details></div>`;

  const kvSample = UI.kv([['Club', null], ['Competition', null], ['Preferred foot', null], ['Height', null]], { cols: 2 });
  const forms = `<div class="field-row"><div class="field"><label for="ds-input">Name</label><input id="ds-input" class="input" placeholder="Text input"></div><div class="field"><label for="ds-select">Formation</label>${UI.select({ id: 'ds-select', options: FORMATION_IDS.map((f) => ({ value: f, label: f })), value: DEFAULT_FORMATION })}</div></div>`;

  const tableSample = UI.table([
    { label: 'Position', render: (r) => `<span class="pos">${r.pos}</span>${r.name}` },
    { label: 'Priority', render: (r) => UI.priority(r.prio) },
    { label: 'Status', render: (r) => UI.vocab('need', r.status) },
  ], [
    { pos: 'CB', name: 'Centre-back', prio: 'high', status: 'required' },
    { pos: 'ST', name: 'Striker', prio: 'low', status: 'monitor' },
  ], { caption: 'Example table' });

  const kpiSample = `<div class="panel"><div class="kpis" style="grid-template-columns:repeat(2,minmax(0,1fr))">${UI.kpi({ label: 'Figure label', value: '214', sub: 'Context line' })}${UI.kpi({ label: 'With meter', value: '47', sub: '78% of target', meter: 0.78 })}</div></div>`;

  return `<div class="grid">
    ${UI.panel({ cls: 'span-6', title: 'Actions', meta: 'Three visible, the rest in the menu', body: buttons })}
    ${UI.panel({ cls: 'span-6', title: 'Status and chips', body: chips })}
    ${UI.panel({ cls: 'span-6', title: 'Tabs', meta: 'Split one subject into areas', body: tabsSample })}
    ${UI.panel({ cls: 'span-6', title: 'Accordion', meta: 'Secondary detail, closed by default', body: accSample })}
    ${UI.panel({ cls: 'span-6', title: 'Key-value list', meta: 'Missing values show a dash', body: kvSample })}
    ${UI.panel({ cls: 'span-6', title: 'Form controls', body: forms })}
    ${UI.panel({ cls: 'span-6', title: 'Table', flush: true, body: tableSample })}
    ${UI.panel({ cls: 'span-6', title: 'Figures', body: kpiSample })}
    ${UI.panel({ cls: 'span-12', title: 'Empty states', body: `<div class="pattern-row"><div class="ds-frame">${UI.emptyState({ iconName: 'shadow', title: 'No shadow teams yet', text: 'Page-level: one line and the main action.', action: UI.btn({ label: 'Create shadow team', variant: 'primary', iconName: 'plus', action: 'noop' }) })}</div><div class="ds-frame">${UI.emptyState({ size: 'sm', iconName: 'clock', title: 'No internal activity yet' })}${UI.emptyState({ size: 'sm', iconName: 'note', title: 'No notes yet' })}</div></div>` })}
  </div>`;
}

function dsPatterns() {
  const squadVsShadow = `<div class="pattern-row">
    <div class="pattern"><span class="marker marker--squad">CB</span><div><div class="cell-strong">Real squad ${UI.squadTag('Our squad')}</div><div class="cell-sub">Solid marker and solid tag. Players under contract.</div></div></div>
    <div class="pattern"><span class="marker marker--shadow">CB</span><div><div class="cell-strong">Shadow team ${UI.shadowTag('Shadow')}</div><div class="cell-sub">Dashed marker and the shadow tag. External options.</div></div></div>
  </div>`;
  const header = `<div class="ds-frame">${UI.pageHeader({ title: 'Page title', desc: 'One short line, only when it helps.', meta: UI.stage('need'), actions: UI.btn({ label: 'Main action', variant: 'primary', iconName: 'plus', action: 'noop' }) })}</div>`;
  const rules = `<ul class="ds-rules">
    <li>${icon('check')}<span>Each page answers four questions at a glance: where am I, what matters most, what is the main action, where is the rest.</span></li>
    <li>${icon('check')}<span>Show less at once. Put secondary detail behind tabs, accordions and menus rather than removing it.</span></li>
    <li>${icon('check')}<span>The breadcrumb says where you are, so page headers carry no eyebrow label.</span></li>
    <li>${icon('check')}<span>At most three visible actions per object. Everything else goes under More actions.</span></li>
    <li>${icon('check')}<span>The accent marks selection and main actions. Green, amber and red carry state, always with an icon and a label.</span></li>
    <li>${icon('check')}<span>Missing data shows as a dash or an empty state, never as zero or invented values.</span></li>
    <li>${icon('check')}<span>Solid means the real squad; dashed means shadow options. The two never share a marker style.</span></li>
  </ul>`;
  return `<div class="grid">
    ${UI.panel({ cls: 'span-12', title: 'Page header', body: header })}
    ${UI.panel({ cls: 'span-6', title: 'Real squad and shadow teams', body: squadVsShadow })}
    ${UI.panel({ cls: 'span-6', title: 'Internal status', body: UI.statusTrack('scouting') })}
    ${UI.panel({ cls: 'span-12', title: 'Workflow', body: UI.workflow(['need', 'planning']) })}
    ${UI.panel({ cls: 'span-12', title: 'Rules', body: rules })}
  </div>`;
}

function renderDesignSystem() {
  const tabs = [{ id: 'foundations', label: 'Foundations' }, { id: 'components', label: 'Components' }, { id: 'patterns', label: 'Patterns' }];
  const cur = tabs.some((t) => t.id === state.dsTab) ? state.dsTab : 'foundations';
  const body = cur === 'components' ? dsComponents() : cur === 'patterns' ? dsPatterns() : dsFoundations();
  return `<div class="page">
    ${UI.pageHeader({ title: 'Design System', desc: 'Tokens and components every module is built from.' })}
    <div>
      ${UI.tabs(tabs, cur, 'ds-tab')}
      <div class="tabpanel" role="tabpanel" id="tabpanel" aria-labelledby="tab-${cur}" style="padding-top:20px">${body}</div>
    </div>
  </div>`;
}

/* ---- View registry: add each module here as it is built ---- */
/* ---- 6x. Settings › Users & Permissions ---- */
const roleDefaults = (roleId) => effectivePermissions(roleId, {});
// For people other than the Owner, permissions the server keeps for the Owner are shown but not granted.
const grantable = (key) => !ownerOnlyOnServer(key);

function moduleLevel(mod, set) {
  const keys = mod.actions.map(([k]) => k).filter(grantable);
  const on = keys.filter((k) => set.has(k));
  if (!keys.length) return ['Owner only', 'locked'];
  if (!on.length) return ['No access', 'none'];
  if (on.length === keys.length) return ['Full access', 'full'];
  if (on.every((k) => VIEW_PERMISSIONS.has(k))) return ['View only', 'view'];
  return ['Partial access', 'partial'];
}
const levelChip = ([label, tone]) => `<span class="lvl-chip lvl-chip--${tone}">${esc(label)}</span>`;

/** The access editor: one row per area, expandable to the individual permissions. */
function permissionEditor(set, roleId, { editable = true } = {}) {
  const defaults = roleDefaults(roleId);
  return `<div class="perm-list" data-role="${esc(roleId)}">${PERMISSION_MODULES.map((mod) => {
    const changed = mod.actions.some(([k]) => grantable(k) && set.has(k) !== defaults.has(k));
    const locked = mod.actions.every(([k]) => !grantable(k));
    const note = mod.later ? 'This area is not built yet. Its permissions are prepared for later.'
      : locked ? 'The server keeps this information for the Owner only in this setup.'
        : mod.actions.some(([k]) => !grantable(k)) ? 'Some of these actions are kept for the Owner on the server in this setup.' : '';
    return `<details class="perm-mod" data-module="${mod.id}">
      <summary>
        <span class="perm-mod__icon">${icon(mod.icon)}</span>
        <span class="perm-mod__name">${esc(mod.label)}</span>
        <span class="perm-mod__changed" data-changed-for="${mod.id}"${changed ? '' : ' hidden'} title="Different from the role’s defaults">Custom</span>
        <span data-level-for="${mod.id}">${levelChip(moduleLevel(mod, set))}</span>
        ${icon('chevron', 'chev')}
      </summary>
      <div class="perm-mod__body">
        ${note ? `<p class="perm-note">${icon(locked || mod.later ? 'lock' : 'info')}<span>${esc(note)}</span></p>` : ''}
        ${mod.actions.map(([k, label]) => {
          const ok = grantable(k);
          return `<label class="perm-row${ok ? '' : ' is-locked'}"><input type="checkbox" name="perm" value="${k}" data-change="perm-toggle"${ok && set.has(k) ? ' checked' : ''}${!ok || !editable ? ' disabled' : ''}><span>${esc(label)}</span>${ok ? '' : `<span class="perm-row__tag">Owner</span>`}</label>`;
        }).join('')}
      </div>
    </details>`;
  }).join('')}</div>`;
}
// Selected permissions in an editor, with prerequisites applied.
const editorSet = (root) => new Set($$('input[name="perm"]:checked', root).map((i) => i.value));
function refreshEditorSummary(root) {
  const list = root.querySelector('.perm-list');
  if (!list) return;
  const set = editorSet(root);
  const defaults = roleDefaults(list.dataset.role);
  PERMISSION_MODULES.forEach((mod) => {
    const lvl = root.querySelector(`[data-level-for="${mod.id}"]`);
    if (lvl) lvl.innerHTML = levelChip(moduleLevel(mod, set));
    const ch = root.querySelector(`[data-changed-for="${mod.id}"]`);
    if (ch) ch.hidden = !mod.actions.some(([k]) => grantable(k) && set.has(k) !== defaults.has(k));
  });
}
// Overrides = the differences from the role's defaults.
function overridesFrom(set, roleId) {
  const defaults = roleDefaults(roleId);
  const out = {};
  ALL_PERMISSIONS.filter(grantable).forEach((k) => { if (set.has(k) !== defaults.has(k)) out[k] = set.has(k); });
  return out;
}

const relTime = (iso) => (iso ? fmtStamp(iso) : '');
function userRows() {
  const rows = [];
  const oid = ownerId();
  rows.push({ kind: 'owner', id: oid, name: personName(oid, OWNER_NAME), email: oid === Viewer.id ? (Viewer.email || '') : personEmail(oid), role: 'Owner', status: ['Active', 'positive'], last: PresenceStore.get(oid) });
  activeMembers().forEach((m) => rows.push({ kind: 'member', id: m.userId, name: personName(m.userId), email: personEmail(m.userId), role: roleLabel(m.role), status: ['Active', 'positive'], last: PresenceStore.get(m.userId) }));
  if (InviteStore.started()) {
    JoinRequestStore.list().filter((r) => !MemberStore.get(r.id)).forEach((r) => {
      const inv = matchingInvite(r.id);
      rows.push({ kind: 'request', id: r.id, name: personName(r.id), email: personEmail(r.id) || r.email, role: inv ? roleLabel(inv.role) : '', status: ['Waiting for approval', 'warning'], last: null });
    });
    InviteStore.list().filter((i) => i.status === 'pending').forEach((i) => rows.push({ kind: 'invite', id: i.id, name: '', email: i.email, role: roleLabel(i.role), status: ['Invited', 'neutral'], last: null }));
  }
  return rows;
}
// An invitation whose email matches the one claude.ai confirms for this person.
function matchingInvite(userId) {
  const p = People.get(userId);
  const email = ((p && p.email) || '').toLowerCase();
  return email ? InviteStore.list().find((i) => i.status === 'pending' && i.email === email) || null : null;
}

function renderUsers() {
  const inviteBtn = UI.btn({ label: 'Invite user', iconName: 'plus', variant: 'primary', action: 'user-invite' });
  const rows = userRows();
  const none = `<span class="faint">${EMPTY}</span>`;
  const body = `<div class="table-wrap"><table class="table users-table"><caption class="sr-only">Members of ${esc(ORG.name)}</caption>
    <thead><tr><th scope="col">Name</th><th scope="col">Email</th><th scope="col">Role</th><th scope="col">Status</th><th scope="col">Last active</th><th scope="col"><span class="sr-only">Actions</span></th></tr></thead>
    <tbody>${rows.map((r) => {
      const d = { 'data-id': r.id };
      const nameCell = r.kind === 'invite'
        ? `<div class="name-cell"><span class="avatar avatar--sm avatar--ghost" aria-hidden="true">${icon('users')}</span><span class="faint">Not joined yet</span></div>`
        : `<div class="name-cell"><span class="avatar avatar--sm" aria-hidden="true">${esc(initials(r.name))}</span><div style="min-width:0">${r.kind === 'member' ? `<button type="button" class="row-link cell-strong" data-action="member-open" data-id="${esc(r.id)}">${esc(r.name)}</button>` : `<span class="cell-strong">${esc(r.name)}</span>`}${r.id && r.id === Viewer.id ? '<span class="cell-sub">You</span>' : ''}</div></div>`;
      let actions = '';
      if (r.kind === 'owner') actions = `<span class="lock-note" title="The Owner always keeps full access">${icon('lock')}</span>`;
      else if (r.kind === 'member') actions = UI.menu({ id: `mem-${r.id}`, label: 'Member actions', items: [{ label: 'Role and permissions', icon: 'shield', action: 'member-open', data: d }, { sep: true }, { label: 'Remove from organization', icon: 'trash', action: 'member-remove', data: d, danger: true }] });
      else if (r.kind === 'request') actions = `<div class="row-actions">${UI.btn({ label: 'Activate', variant: 'primary', action: 'request-activate', data: d, cls: 'btn--sm' })}${UI.btn({ label: 'Decline', variant: 'ghost', action: 'request-decline', data: d, cls: 'btn--sm' })}</div>`;
      else actions = UI.menu({ id: `inv-${r.id}`, label: 'Invitation actions', items: [{ label: 'Copy invitation message', icon: 'note', action: 'invite-copy', data: d }, { sep: true }, { label: 'Revoke invitation', icon: 'x', action: 'invite-revoke', data: d, danger: true }] });
      return `<tr>
        <td class="wrap">${nameCell}</td>
        <td class="wrap">${r.email ? esc(r.email) : none}</td>
        <td>${r.kind === 'owner' ? `<span class="role-chip role-chip--owner">${icon('lock')}Owner</span>` : r.role ? `<span class="role-chip">${esc(r.role)}</span>` : none}</td>
        <td>${UI.status(r.status[0], r.status[1])}</td>
        <td>${r.last && r.last.lastActive ? `<span class="num">${esc(relTime(r.last.lastActive))}</span>` : none}</td>
        <td class="ta-r">${actions}</td>
      </tr>`;
    }).join('')}</tbody></table></div>`;
  const counts = { members: activeMembers().length + 1, waiting: rows.filter((r) => r.kind === 'request').length };
  return `<div class="page">
    ${UI.pageHeader({ title: 'Users & Permissions', desc: `People in ${ORG.name} and what each of them can do.`, meta: saveStateNote(), actions: inviteBtn })}
    <section class="panel">
      <div class="panel__head"><div class="panel__heading"><h2 class="panel__title">Members</h2><span class="panel__meta">${counts.members}${counts.waiting ? ` · ${counts.waiting} waiting for approval` : ''}</span></div></div>
      ${body}
      <p class="panel-foot">${icon('info')}<span>Inviting here sets the role and permissions. The person creates an account with the invited email and gets in as soon as they confirm it.</span></p>
    </section>
  </div>`;
}

/* -- Member: role and permissions -- */
function openMemberDialog(userId) {
  const m = MemberStore.get(userId);
  if (!m) return;
  const set = effectivePermissions(m.role, m.overrides);
  const editRole = can('users.editRole');
  const editPerms = can('users.editPermissions');
  const pres = PresenceStore.get(userId);
  openDialog(`<form class="dlg-body" data-form="member" data-id="${esc(userId)}" novalidate>
    <div class="member-head">
      <span class="avatar avatar--lg" aria-hidden="true">${esc(initials(personName(userId)))}</span>
      <div style="min-width:0"><h2 class="dlg-title" id="dlg-title">${esc(personName(userId))}</h2><div class="cell-sub">${esc(personEmail(userId) || 'Email not available')}</div></div>
      ${UI.status('Active', 'positive')}
    </div>
    <div class="field-row">
      <div class="field"><label for="f-member-role">Role</label>${UI.select({ id: 'f-member-role', name: 'role', value: m.role, change: 'member-role', disabled: !editRole, options: INVITABLE_ROLES.map((r) => ({ value: r, label: ROLES[r].label })) })}</div>
      <div class="field"><span class="field-label">Last active</span><div class="member-level">${pres && pres.lastActive ? `<span class="num">${esc(relTime(pres.lastActive))}</span>` : '<span class="faint">Not seen yet</span>'}</div></div>
    </div>
    <p class="small faint">${editRole ? 'Changing the role resets the permissions to that role’s defaults.' : ''}</p>
    <div class="sec-head"><h3 class="sec-title">Access</h3></div>
    <div class="dlg-scroll dlg-scroll--perm">${permissionEditor(set, m.role, { editable: editPerms })}</div>
    <div class="dlg-actions dlg-actions--split">
      ${editPerms ? UI.btn({ label: 'Reset to role defaults', variant: 'ghost', action: 'perm-reset' }) : '<span></span>'}
      <div class="dlg-actions__group"><button type="button" class="btn btn--ghost" data-action="close-dialog">Cancel</button>${editRole || editPerms ? '<button type="submit" class="btn btn--primary">Save changes</button>' : ''}</div>
    </div>
  </form>`, { wide: true });
}
function openRemoveMemberDialog(userId) {
  const m = MemberStore.get(userId);
  if (!m) return;
  const email = personEmail(userId);
  openDialog(`<form class="dlg-body" data-form="member-remove" data-id="${esc(userId)}">
    <h2 class="dlg-title" id="dlg-title">Remove ${esc(personName(userId))}?</h2>
    <p class="dlg-text">They lose access to every area straight away. Their reports, notes and assignments stay.</p>
    <p class="dlg-text">${esc(email || 'Their account')} can still sign in, but will not see any data.</p>
    ${dialogActions('Remove', { variant: 'danger' })}
  </form>`);
}

/* -- Join requests -- */
function openActivateDialog(userId) {
  const req = JoinRequestStore.get(userId);
  if (!req) return;
  const match = matchingInvite(userId);
  const pending = InviteStore.list().filter((i) => i.status === 'pending');
  const verified = (People.get(userId) || {}).email || '';
  const choice = pending.length
    ? `<div class="field"><label for="f-act-invite">Invitation</label>${UI.select({ id: 'f-act-invite', name: 'invite', value: match ? match.id : '', options: [{ value: '', label: 'Choose an invitation' }, ...pending.map((i) => ({ value: i.id, label: `${i.email} · ${roleLabel(i.role)}` }))] })}<p class="field-error" id="f-act-invite-error" hidden>Choose the invitation for this person.</p></div>`
    : `<p class="dlg-text">There are no open invitations. Invite this person first, then activate them here.</p>`;
  openDialog(`<form class="dlg-body" data-form="activate" data-id="${esc(userId)}" novalidate>
    <h2 class="dlg-title" id="dlg-title">Activate access</h2>
    <div class="dlg-player"><span class="avatar">${esc(initials(personName(userId)))}</span><div><div class="cell-strong">${esc(personName(userId))}</div><div class="cell-sub">${esc(verified || req.email || 'Email not available')}</div></div></div>
    ${match ? `<p class="perm-note perm-note--ok">${icon('check')}<span>This email is confirmed and matches the invitation as ${esc(roleLabel(match.role))}.</span></p>`
      : `<p class="perm-note perm-note--warn">${icon('alert')}<span>This email does not match any open invitation. Check it is the person you invited, then choose their invitation.</span></p>`}
    ${choice}
    ${dialogActions('Activate', { disabled: !pending.length })}
  </form>`);
}

/* -- Invite user: email, role, permissions, send -- */
let invite = null;
function openInviteDialog() {
  invite = { step: 1, email: '', role: 'scout', perms: roleDefaults('scout'), created: null };
  renderInviteDialog();
}
function renderInviteDialog() {
  const steps = ['Email', 'Role', 'Permissions', 'Send'];
  const stepper = invite.step <= 4 ? `<ol class="stepper" aria-label="Invitation steps">${steps.map((l, i) => `<li class="${i + 1 === invite.step ? 'is-current' : i + 1 < invite.step ? 'is-done' : ''}"><span>${i + 1}</span>${esc(l)}</li>`).join('')}</ol>` : '';
  const back = (to) => UI.btn({ label: 'Back', variant: 'ghost', action: 'invite-step', data: { 'data-to': String(to) } });
  const foot = (left, submit) => `<div class="dlg-actions dlg-actions--split">${left || '<span></span>'}<div class="dlg-actions__group"><button type="button" class="btn btn--ghost" data-action="close-dialog">Cancel</button><button type="submit" class="btn btn--primary">${esc(submit)}</button></div></div>`;
  let body = '';
  if (invite.step === 1) {
    body = `${F.text('email', 'Email', invite.email, { type: 'email', error: 'Enter a valid email address.', placeholder: 'name@club.pt', extra: { maxlength: 120, autocomplete: 'off' } })}
      <p class="small faint">They will create their account with this email.</p>
      ${foot('', 'Next')}`;
  } else if (invite.step === 2) {
    body = `<fieldset class="role-opts"><legend class="sr-only">Role</legend>${INVITABLE_ROLES.map((r) => `<label class="role-opt"><input type="radio" name="role" value="${r}"${invite.role === r ? ' checked' : ''}><span><b>${esc(ROLES[r].label)}</b><small>${esc(ROLES[r].desc)}</small></span></label>`).join('')}</fieldset>
      ${foot(back(1), 'Next')}`;
  } else if (invite.step === 3) {
    body = `<p class="small faint">${esc(ROLES[invite.role].label)} defaults. Open an area to adjust it for this person.</p>
      <div class="dlg-scroll dlg-scroll--perm">${permissionEditor(invite.perms, invite.role, { editable: can('users.editPermissions') })}</div>
      ${foot(back(2), 'Next')}`;
  } else if (invite.step === 4) {
    body = `<dl class="review">
        <div><dt>Email</dt><dd>${esc(invite.email)}</dd></div>
        <div><dt>Role</dt><dd>${esc(ROLES[invite.role].label)}</dd></div>
      </dl>
      <ul class="review-access">${PERMISSION_MODULES.map((mod) => `<li><span>${esc(mod.label)}</span>${levelChip(moduleLevel(mod, invite.perms))}</li>`).join('')}</ul>
      <p class="perm-note">${icon('info')}<span>After this, send ${esc(invite.email)} the invitation message. They get in as soon as they create their account with this email and confirm it.</span></p>
      ${foot(back(3), 'Create invitation')}`;
  } else {
    body = `<p class="ns-saved">${icon('check')}Invitation created</p>
      <ol class="next-steps">
        <li>Send them the message below.</li>
        <li>They create their account with this email and confirm it.</li>
        <li>Their access opens by itself, with the role and permissions you chose.</li>
      </ol>
      <div class="field"><label for="f-invite-msg">Message</label><textarea id="f-invite-msg" class="textarea" rows="7" readonly>${esc(inviteMessage(invite.email, invite.role))}</textarea></div>
      <div class="dlg-actions">${UI.btn({ label: 'Copy message', iconName: 'note', action: 'invite-copy', data: { 'data-id': invite.created || '' } })}<button type="button" class="btn btn--primary" data-action="close-dialog">Done</button></div>`;
  }
  openDialog(`<form class="dlg-body" data-form="invite" data-step="${invite.step}" novalidate>
    <h2 class="dlg-title" id="dlg-title">Invite user</h2>
    ${stepper}
    ${body}
  </form>`, { wide: invite.step === 3 });
}
const inviteMessage = (email, role) => `Olá,

Convidei-te para a plataforma de scouting do ${ORG.name}, com o perfil ${inPortuguese(ROLES[role].label)}.

1. Abre ${APP_URL}
2. Escolhe "Criar conta" e usa este email: ${email}
3. Confirma o email no link que vais receber. Depois entras logo com o teu perfil.`;
async function copyText(text) {
  try { await navigator.clipboard.writeText(text); return true; } catch (e) { /* fall back below */ }
  const ta = document.createElement('textarea');
  ta.value = text; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.opacity = '0';
  (dlg.open ? dlg : document.body).appendChild(ta);
  ta.select();
  let ok = false;
  try { ok = document.execCommand('copy'); } catch (e) { ok = false; }
  ta.remove();
  return ok;
}

const VIEWS = {
  'dashboard': renderDashboard,
  'players-database': renderPlayerDatabase,
  'player-profile': renderPlayerProfile,
  'squad-first-team': renderFirstTeam,
  'squad-needs': renderNeeds,
  'scouting-reports': renderReports,
  'scouting-assignments': renderAssignments,
  'scouting-criteria': renderCriteria,
  'squad-shadow-teams': renderShadowTeams,
  'settings-users': renderUsers,
  'design-system': renderDesignSystem,
};

/* ---------------------------------------------------------------------
   PERMISSION GATES
   One map per kind of interaction. The same map decides what the interface
   shows (applyGates, after every render) and what an action may do when it
   runs (the dispatchers below), so a hidden control and a blocked action
   never disagree. Interactions not listed are open to everyone with access.
   --------------------------------------------------------------------- */
const NO_PERMISSION = 'You don’t have permission to do this.';
const reportOf = (el) => ReportStore.get(el.dataset.id);
const requestOf = (el) => RequestStore.get(el.dataset.id);
const noteOf = (el) => NoteStore.get(el.dataset.id);
const ACTION_GUARDS = {
  'player-action': (el) => (el.dataset.id === 'scout' ? can('reports.create') : el.dataset.id === 'shortlist' ? can('shortlists.create') : false),
  'player-new': 'players.create',
  'player-edit': 'players.edit',
  'pos-edit': 'players.edit',
  'player-reopen': 'players.edit',
  'player-delete': 'players.delete',
  'open-player': 'players.view',
  'import-open': (el) => can('players.import') && (!el.dataset.squad || can('squad.edit')),
  'imp-template': 'players.import',
  'imp-paste': 'players.import',
  'imp-back': 'players.import',
  'imp-run': 'players.import',
  'export-all': 'data.export',
  'note-edit': (el) => canEditNote(noteOf(el)),
  'note-delete': (el) => canEditNote(noteOf(el)),
  'report-new': 'reports.create',
  'report-for': 'reports.create',
  'report-pick': 'reports.create',
  'pick-new-player': () => can('reports.create') && can('players.create'),
  'rq-player-new': 'players.create',
  'report-view': (el) => canViewReport(reportOf(el)),
  'report-edit': (el) => canEditReport(reportOf(el)),
  'report-delete': (el) => canDeleteReport(reportOf(el)),
  'request-pick': () => canAny('assignments.viewOwn', 'assignments.create'),
  'request-report': (el) => can('reports.create') && canWorkAssignment(requestOf(el)),
  'request-edit': (el) => canManageAssignment(requestOf(el)),
  // Marking your own assignment as done is your work; cancelling or reopening is the manager's.
  'request-status': (el) => (el.dataset.status === 'done' ? canWorkAssignment(requestOf(el)) : canManageAssignment(requestOf(el))),
  'request-delete': (el) => canManageAssignment(requestOf(el)),
  'crit-add': 'criteria.manage',
  'crit-remove': 'criteria.manage',
  'crit-reset': 'criteria.manage',
  'open-add-shadow': 'shadow.addPlayers',
  'squad-new': () => can('squad.edit') && can('players.create'),
  'squad-add-existing': 'squad.edit',
  'squad-edit': 'squad.edit',
  'squad-remove': 'squad.edit',
  'need-goto': 'shortlists.view',
  'need-new': 'shortlists.create',
  'need-edit': 'shortlists.edit',
  'need-status': 'shortlists.edit',
  'need-delete': 'shortlists.delete',
  'need-add-candidate': 'shortlists.create',
  'need-pick': 'shortlists.create',
  'need-remove-candidate': 'shortlists.delete',
  'link-need': 'shortlists.create',
  'st-new': 'shadow.create',
  'st-rename': 'shadow.edit',
  'st-delete': 'shadow.delete',
  'st-up': 'shadow.edit',
  'st-down': 'shadow.edit',
  'st-move-to': 'shadow.edit',
  'st-remove': 'shadow.addPlayers',
  'user-invite': 'users.invite',
  'invite-step': 'users.invite',
  'invite-copy': 'users.invite',
  'invite-revoke': 'users.invite',
  'member-open': 'users.view',
  'member-remove': 'users.remove',
  'perm-reset': 'users.editPermissions',
  'request-activate': 'users.invite',
  'request-decline': 'users.invite',
  'access-request': () => Access.state === 'none',
};
const FORM_GUARDS = {
  'st-team': (f) => (f.dataset.id ? can('shadow.edit') : can('shadow.create')),
  'st-delete': 'shadow.delete',
  'st-move': 'shadow.edit',
  'add-shadow': 'shadow.addPlayers',
  'note': 'notes.create',
  'note-edit': (f) => canEditNote(NoteStore.get(f.dataset.id)),
  'note-delete': (f) => canEditNote(NoteStore.get(f.dataset.id)),
  'player-new': 'players.create',
  'pick-player-new': () => can('reports.create') && can('players.create'),
  'player-edit': 'players.edit',
  'positions': 'players.edit',
  'player-delete': 'players.delete',
  'squad-new': () => can('squad.edit') && can('players.create'),
  'squad-member': 'squad.edit',
  'report': (f) => (f.dataset.id ? canEditReport(ReportStore.get(f.dataset.id)) : can('reports.create')),
  'report-delete': (f) => canDeleteReport(ReportStore.get(f.dataset.id)),
  'request': (f) => (f.dataset.id ? canManageAssignment(RequestStore.get(f.dataset.id)) : canAny('assignments.viewOwn', 'assignments.create')),
  'criteria': 'criteria.manage',
  'need': (f) => (f.dataset.id ? can('shortlists.edit') : can('shortlists.create')),
  'need-delete': 'shortlists.delete',
  'link-need': 'shortlists.create',
  'invite': 'users.invite',
  'member': () => canAny('users.editRole', 'users.editPermissions'),
  'member-remove': 'users.remove',
  'activate': 'users.invite',
  'next-step': (f) => nextStepAllowed(ReportStore.get(f.dataset.report)),
};
const CHANGE_GUARDS = {
  'perm-toggle': (el) => (el.closest('form[data-form="invite"]') ? can('users.invite') : can('users.editPermissions')),
  'member-role': 'users.editRole',
  'st-formation': 'shadow.edit',
  'add-team': 'shadow.addPlayers',
  'imp-file': 'players.import',
  'imp-squad': 'squad.edit',
  'imp-map': 'players.import',
};
// Navigation links stay readable as text when the target is not allowed; commands disappear.
const NAV_ACTIONS = new Set(['open-player', 'need-goto', 'report-view']);
// Actions that work before access is settled (the access screens and the shell).
const OPEN_ACTIONS = new Set(['noop', 'open-drawer', 'close-dialog', 'toggle-menu', 'access-request', 'set-lang', 'set-theme', 'sign-out']);

function permitted(guards, key, el) {
  const g = guards[key];
  if (g === undefined) return true;
  return typeof g === 'string' ? can(g) : !!g(el);
}
function unwrap(el) {
  if (el.tagName === 'TR') { el.removeAttribute('data-action'); el.classList.remove('is-clickable'); return; }
  const span = document.createElement('span');
  span.className = el.className.replace(/\brow-link\b/, '').trim();
  while (el.firstChild) span.appendChild(el.firstChild);
  el.replaceWith(span);
}
// Hides what the viewer may not use, inside a freshly rendered page or dialog.
function applyGates(root) {
  if (!root || Viewer.isOwner) return;
  root.querySelectorAll('[data-action]').forEach((el) => {
    const a = el.dataset.action;
    if (a === 'toggle-menu' || permitted(ACTION_GUARDS, a, el)) return;
    if (NAV_ACTIONS.has(a)) unwrap(el); else el.remove();
  });
  root.querySelectorAll('[data-route]').forEach((el) => {
    if (canOpenPage(el.dataset.route)) return;
    if (el.classList.contains('link-more')) el.remove(); else unwrap(el);
  });
  root.querySelectorAll('form[data-form]').forEach((f) => {
    if (permitted(FORM_GUARDS, f.dataset.form, f)) return;
    if (f.dataset.lock === 'hide') { (f.closest('[data-lock-scope]') || f).hidden = true; return; }
    f.querySelectorAll('input, select, textarea, button').forEach((c) => { if (c.type === 'submit') c.remove(); else c.disabled = true; });
  });
  root.querySelectorAll('[data-change]').forEach((el) => { if (!permitted(CHANGE_GUARDS, el.dataset.change, el)) el.disabled = true; });
  if (!can('shadow.edit')) root.querySelectorAll('.st-entry[draggable="true"]').forEach((el) => el.removeAttribute('draggable'));
  // Menus: no leading, trailing or doubled separators; no empty menus.
  root.querySelectorAll('.menu').forEach((m) => {
    let prev = null;
    [...m.children].forEach((c) => {
      const sep = c.classList.contains('menu-sep');
      if (sep && (!prev || prev.classList.contains('menu-sep'))) { c.remove(); return; }
      prev = c;
    });
    while (m.lastElementChild && m.lastElementChild.classList.contains('menu-sep')) m.lastElementChild.remove();
    if (!m.querySelector('.menu-item')) { const wrap = m.closest('.menu-wrap'); if (wrap) wrap.remove(); }
  });
}

/* -- Screens for people who cannot enter (yet) -- */
function renderNoPermission() {
  return `<div class="page"><section class="panel">${UI.emptyState({ size: 'lg', iconName: 'lock', title: 'You don’t have permission to access this area.', action: UI.linkMore('Go to the Dashboard', 'dashboard') })}</section></div>`;
}
function renderAccessScreen() {
  const box = (iconName, title, text, action = '') => `<div class="page"><section class="panel access-box">${UI.emptyState({ size: 'lg', iconName, title, text, action })}</section></div>`;
  switch (Access.state) {
    case 'checking':
      return `<div class="page"><section class="panel"><div class="loading">Checking your access…</div></section></div>`;
    case 'unknown':
      return box('lock', 'We couldn’t confirm your account', 'Sign out and sign in again with the email you were invited with.');
    case 'pending':
      return box('clock', 'Access requested', `${ORG.name} will let you in once your access is activated. This page updates by itself.`);
    case 'suspended':
      return box('lock', 'Your access is paused', `Ask the Owner of ${ORG.name} to reactivate it.`);
    default:
      return box('users', `You don’t have access to ${ORG.name} yet`, 'If you were invited, request access. The Owner activates it from Users & Permissions.',
        UI.btn({ label: 'Request access', variant: 'primary', action: 'access-request' }));
  }
}
function viewerBadge() {
  if (Access.state === 'checking') return '';
  const nameText = Viewer.name || (Viewer.isOwner ? OWNER_NAME : 'You');
  const role = Viewer.isOwner ? 'Owner' : roleLabel(Access.role) || (Access.state === 'ready' ? '' : 'No access');
  const signOut = window.ScoutingAuth ? `<button type="button" class="icon-btn" data-action="sign-out" aria-label="Sign out" title="Sign out">${icon('logout')}</button>` : '';
  return `<div class="user">
    <span class="avatar" aria-hidden="true">${esc(initials(nameText))}</span>
    <div class="user__text"><div class="user__name">${esc(nameText)}</div><div class="user__role">${esc(role)}</div></div>
    ${signOut}
  </div>`;
}

/* ---------------------------------------------------------------------
   7. SHELL
   --------------------------------------------------------------------- */
// Only pages that are built appear in the menu; the others return as their modules are built.
const isBuilt = (id) => !!VIEWS[id];
// Which pages each person may open. Hidden pages are also refused when opened by address.
const PAGE_ACCESS = {
  'dashboard': () => true,
  'players-database': () => can('players.view'),
  'player-profile': () => can('players.view'),
  'scouting-reports': () => canAny('reports.viewOwn', 'reports.viewTeam'),
  'scouting-assignments': () => canAny('assignments.viewOwn', 'assignments.viewAll'),
  'scouting-criteria': () => can('criteria.view'),
  'squad-first-team': () => can('squad.view'),
  'squad-needs': () => can('shortlists.view'),
  'squad-shadow-teams': () => can('shadow.view'),
  'settings-users': () => can('users.view'),
  'design-system': () => Viewer.isOwner,
};
const pageAllowed = (id) => Access.state === 'ready' && !!(PAGE_ACCESS[id] && PAGE_ACCESS[id]());
const canOpenPage = (id) => isBuilt(id) && pageAllowed(id);
function renderSidebar() {
  const topItem = (p) => `<a class="nav-item" href="#${p.id}" data-route="${p.id}">${icon(p.icon)}<span>${esc(p.label)}</span></a>`;
  const sections = SECTIONS.map((s) => ({ ...s, pages: s.pages.filter((p) => canOpenPage(p.id)) })).filter((s) => s.pages.length);
  const ready = Access.state === 'ready';
  const groups = sections.map((s) => `<div class="nav-group" data-section="${s.id}">
      <button type="button" class="nav-item nav-group__head" data-toggle="${s.id}" aria-expanded="false" aria-controls="nav-${s.id}">
        ${icon(s.icon)}<span>${esc(s.label)}</span>${icon('chevron', 'chev')}
      </button>
      <ul class="nav-sub" id="nav-${s.id}">
        ${s.pages.map((p) => `<li><a href="#${p.id}" data-route="${p.id}">${esc(p.label)}</a></li>`).join('')}
      </ul>
    </div>`).join('');

  $('#sidebar').innerHTML = `
    <div class="sb-brand">
      <img class="sb-logo" src="logo.svg" alt="" width="28" height="28">
      <span class="sb-name">Scouting &amp; Recruitment</span>
    </div>
    <nav class="sb-nav" aria-label="Modules">
      ${ready ? `${topItem(PAGES.dashboard)}<div class="nav-sep" role="separator"></div>${groups}` : ''}
    </nav>
    <div class="sb-foot">
      ${ready && can('data.export') ? `<button type="button" class="nav-item" data-action="export-all" title="Download everything you can see in one Excel file">${icon('download')}<span>Export all</span></button>` : ''}
      ${themeSwitch()}
    </div>`;
}

// Theme: each person chooses; kept in this browser. Light unless another was chosen.
function themeSwitch() {
  return `<div class="theme-pick"><span class="theme-pick__label">Theme</span><div class="seg seg--theme" role="group" aria-label="Theme">${THEMES.map((t) => `<button type="button" class="seg__btn${t.id === THEME ? ' is-active' : ''}" data-action="set-theme" data-theme-id="${t.id}" aria-pressed="${t.id === THEME}"><i class="theme-dot theme-dot--${t.id}" aria-hidden="true"></i><span>${t.label}</span></button>`).join('')}</div></div>`;
}
function setTheme(id) {
  if (!THEMES.some((t) => t.id === id) || id === THEME) return;
  THEME = id;
  try { localStorage.setItem('theme', id); } catch (e) { /* kept for this visit only */ }
  applyTheme();
  $$('#sidebar [data-action="set-theme"]').forEach((b) => {
    const on = b.dataset.themeId === id;
    b.classList.toggle('is-active', on);
    b.setAttribute('aria-pressed', String(on));
  });
}

function syncSidebar(page) {
  $$('#sidebar [data-route]').forEach((a) => {
    const on = a.dataset.route === page.id;
    a.classList.toggle('is-active', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  $$('#sidebar .nav-group').forEach((g) => {
    const id = g.dataset.section;
    const open = !!state.groupOpen[id];
    g.classList.toggle('is-current', !!page.section && page.section.id === id);
    g.classList.toggle('is-open', open);
    g.querySelector('[data-toggle]').setAttribute('aria-expanded', String(open));
  });
}

function renderTopbar(page) {
  const crumbs = page.section
    ? `<span>${esc(page.section.label)}</span>${icon('chevronR')}<b>${esc(page.label)}</b>`
    : `<b>${esc(page.label)}</b>`;
  $('#topbar').innerHTML = `
    <button type="button" class="icon-btn menu-btn" data-action="open-drawer" aria-label="Open navigation" aria-controls="sidebar">${icon('menu')}</button>
    <nav class="crumbs" aria-label="Breadcrumb">${crumbs}</nav>
    <div class="topbar__right">
      <span class="ctx"><b>${esc(CLUB.name)}</b> · ${esc(SEASON.label)}</span>
      ${languageSwitch()}
      ${viewerBadge()}
    </div>`;
}

// Language: each person chooses; the whole interface switches at once, data stays as saved.
function languageSwitch() {
  return `<div class="seg seg--lang" role="group" aria-label="Language">${LANGUAGES.map((l) => `<button type="button" class="seg__btn${l.id === LANG ? ' is-active' : ''}" data-action="set-lang" data-lang="${l.id}" aria-pressed="${l.id === LANG}" title="${esc(l.name)}" lang="${l.html}" translate="no">${l.short}</button>`).join('')}</div>`;
}
function setLanguage(id) {
  if (!LANGUAGE[id] || id === LANG) return;
  LANG = id;
  try { localStorage.setItem('lang', id); } catch (e) { /* kept for this visit only */ }
  applyLanguage();
  renderSidebar();
  navigate(state.route || routeFromHash(), { record: false });
}

function setDrawer(open) { $('#app').classList.toggle('is-drawer-open', open); }

/* ---------------------------------------------------------------------
   8. ROUTER AND INTERACTIONS
   Page ids use letters and hyphens only, so they work as deep links.
   --------------------------------------------------------------------- */
const state = {
  route: null,
  groupOpen: {},
  playerId: null,          // set when a player is opened from the Player Database or the squad
  db: { q: '', pos: '', scope: 'all', status: '' },
  needs: { selected: null, scope: 'active', pickQ: '' },
  reports: { q: '', type: '', rec: '' },
  requests: { scope: 'open' },
  pick: { q: '', next: '' },
  profileTab: 'overview',
  perfGroup: 'playing-time',
  dsTab: 'foundations',
  shadow: { teamId: null, pos: null },
};

function routeFromHash() {
  const id = (location.hash || '').replace(/^#/, '');
  return PAGES[id] && isBuilt(id) ? id : DEFAULT_ROUTE;
}

function renderView() {
  const page = PAGES[state.route];
  let html;
  if (Access.state !== 'ready') html = renderAccessScreen();
  else if (!pageAllowed(page.id)) html = renderNoPermission();
  else html = (VIEWS[page.id] || (() => renderScaffold(page)))(page);
  $('#content').innerHTML = html;
  applyGates($('#content'));
}

// Re-render the current view in place, keeping scroll position and focus.
function refresh() {
  if (!state.route) return;
  const content = $('#content');
  const top = content.scrollTop;
  const activeId = document.activeElement && document.activeElement.id;
  const kept = $$('#content [data-keep]').filter((el) => el.id && el.value).map((el) => [el.id, el.value]);
  renderView();
  kept.forEach(([id, value]) => { const el = document.getElementById(id); if (el && !el.value) el.value = value; });
  content.scrollTop = top;
  if (activeId) {
    const el = document.getElementById(activeId);
    if (el && content.contains(el)) {
      el.focus({ preventScroll: true });
      if (el.tagName === 'INPUT' && /^(text|search)$/.test(el.type)) {
        try { el.setSelectionRange(el.value.length, el.value.length); } catch (e) { /* ignore */ }
      }
    }
  }
}
let refreshQueued = false;
function queueRefresh() {
  if (refreshQueued) return;
  refreshQueued = true;
  setTimeout(() => { refreshQueued = false; refresh(); }, 0);
}

function navigate(id, { record = true } = {}) {
  if (!PAGES[id] || !isBuilt(id)) id = DEFAULT_ROUTE;
  const page = PAGES[id];
  const changed = state.route !== id;
  state.route = id;
  if (changed) state.groupOpen = page.section ? { [page.section.id]: true } : {};
  renderTopbar(page);
  syncSidebar(page);
  renderView();
  const content = $('#content');
  if (changed) {
    content.scrollTop = 0;
    content.focus({ preventScroll: true });
  }
  if (record && location.hash !== `#${id}`) {
    try { history.pushState(null, '', `#${id}`); } catch (e) { /* sandboxed frame: keep in-memory route */ }
  }
}

/* ---- Toast ---- */
function toast(message, iconName = 'info') {
  const host = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast';
  el.innerHTML = `${icon(iconName)}<span></span>`;
  el.querySelector('span').textContent = message;
  host.appendChild(el);
  setTimeout(() => el.remove(), 3600);
}

/* ---- Dialog ---- */
const dlg = $('#dlg');
function openDialog(html, { wide = false } = {}) {
  closeMenus();
  dlg.classList.toggle('dlg--wide', wide);
  dlg.innerHTML = html;
  applyGates(dlg);
  if (!dlg.open) dlg.showModal();
  const first = dlg.querySelector('input:not([disabled]), select:not([disabled]), textarea:not([disabled])');
  if (first) first.focus();
}
function closeDialog() { if (dlg.open) dlg.close(); }
dlg.addEventListener('close', () => { dlg.innerHTML = ''; delete dlg.dataset.view; dlg.classList.remove('dlg--wide'); });
dlg.addEventListener('cancel', (e) => { if (imp && imp.busy) e.preventDefault(); });   // keep open while importing
dlg.addEventListener('click', (e) => { if (e.target === dlg && !(imp && imp.busy)) closeDialog(); });
const dialogActions = (submitLabel, { variant = 'primary', disabled = false } = {}) => `<div class="dlg-actions">
  <button type="button" class="btn btn--ghost" data-action="close-dialog">Cancel</button>
  <button type="submit" class="btn btn--${variant}"${disabled ? ' disabled' : ''}>${esc(submitLabel)}</button>
</div>`;

/* ---- Menus ---- */
function closeMenus(except) {
  $$('.menu:not([hidden])').forEach((m) => {
    if (m === except) return;
    m.hidden = true;
    const t = document.querySelector(`[aria-controls="${m.id}"]`);
    if (t) t.setAttribute('aria-expanded', 'false');
  });
}
// Row menus inside a scrolling table are placed against the viewport so the table never clips them.
function floatMenu(menu, trigger) {
  menu.classList.add('menu--float');
  const r = trigger.getBoundingClientRect();
  const w = menu.offsetWidth, h = menu.offsetHeight;
  const want = menu.classList.contains('menu--start') ? r.left : r.right - w;
  const left = Math.max(8, Math.min(want, window.innerWidth - w - 8));
  const top = r.bottom + 6 + h <= window.innerHeight - 8 ? r.bottom + 6 : Math.max(8, r.top - 6 - h);
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}
document.addEventListener('scroll', (e) => {
  if (e.target && e.target.closest && e.target.closest('.menu')) return;
  $$('.menu--float:not([hidden])').forEach((m) => {
    m.hidden = true;
    const t = document.querySelector(`[aria-controls="${m.id}"]`);
    if (t) t.setAttribute('aria-expanded', 'false');
  });
}, true);

/* ---- Shadow team dialogs and operations ---- */
function openTeamDialog(team = null) {
  const editing = !!team;
  openDialog(`<form class="dlg-body" data-form="st-team"${editing ? ` data-id="${esc(team.id)}"` : ''} novalidate>
    <h2 class="dlg-title" id="dlg-title">${editing ? 'Rename shadow team' : 'New shadow team'}</h2>
    <div class="field">
      <label for="st-name">Name</label>
      <input id="st-name" name="name" class="input" maxlength="60" autocomplete="off" value="${editing ? esc(team.name) : ''}" placeholder="e.g. Summer recruitment">
      <p class="field-error" id="st-name-error" hidden>Enter a name for the shadow team.</p>
    </div>
    ${editing ? '' : `<div class="field"><label for="st-new-formation">Formation</label>${UI.select({ id: 'st-new-formation', name: 'formation', value: DEFAULT_FORMATION, options: FORMATION_IDS.map((f) => ({ value: f, label: f })) })}</div>`}
    ${dialogActions(editing ? 'Save' : 'Create')}
  </form>`);
}

function openDeleteDialog(team) {
  if (!team) return;
  openDialog(`<form class="dlg-body" data-form="st-delete" data-id="${esc(team.id)}">
    <h2 class="dlg-title" id="dlg-title">Delete “${esc(team.name)}”?</h2>
    <p class="dlg-text">Its position lists are removed. Player records are not affected.</p>
    ${dialogActions('Delete', { variant: 'danger' })}
  </form>`);
}

function openMoveDialog(playerId, fromPos) {
  const team = currentTeam();
  if (!team) return;
  const slots = FORMATIONS[team.formation];
  const value = slots.some(([p]) => p === fromPos) ? fromPos : slots[0][0];
  openDialog(`<form class="dlg-body" data-form="st-move" data-player="${esc(playerId)}" data-from="${esc(fromPos)}">
    <h2 class="dlg-title" id="dlg-title">Move to position</h2>
    <p class="dlg-text">${esc(playerName(playerId))}</p>
    <div class="field"><label for="st-move-pos">Position</label>${UI.select({ id: 'st-move-pos', name: 'pos', value, options: slots.map(([p]) => ({ value: p, label: `${p} · ${POSITIONS[p]}` })) })}</div>
    ${dialogActions('Move')}
  </form>`);
}

const PRIORITY_CHOICES = [
  { value: '0', label: `1 · ${tierLabel(0)}` },
  { value: '1', label: `2 · ${tierLabel(1)}` },
  { value: '2', label: `3 · ${tierLabel(2)}` },
  { value: 'end', label: 'Add at the end' },
];
const positionOptions = (team) => FORMATIONS[team.formation].map(([p]) => ({ value: p, label: `${p} · ${POSITIONS[p]}` }));

// Player Profile → More actions → Add to Shadow Team
function openAddToShadow() {
  const p = currentPlayer();
  const teams = ShadowTeamStore.list();
  const team = teams[0];
  const playerRow = `<div class="dlg-player"><span class="avatar">${p ? esc(initials(p.name)) : icon('player')}</span><div><div class="cell-strong">${p ? esc(p.name) : 'No player loaded'}</div><div class="cell-sub">${p ? esc([posLabel(p.position), clubOf(p)].filter(Boolean).join(' · ')) : 'Open a player to add them to a shadow team.'}</div></div></div>`;
  const fields = team ? `
    <div class="field"><label for="add-team">Shadow team</label>${UI.select({ id: 'add-team', name: 'team', change: 'add-team', value: team.id, options: teams.map((t) => ({ value: t.id, label: t.name })) })}</div>
    <div class="field-row">
      <div class="field"><label for="add-pos">Position</label>${UI.select({ id: 'add-pos', name: 'pos', value: slotFor(team.formation, p && p.position), options: positionOptions(team) })}</div>
      <div class="field"><label for="add-rank">Priority</label>${UI.select({ id: 'add-rank', name: 'rank', value: 'end', options: PRIORITY_CHOICES })}</div>
    </div>
    <div class="field"><label for="add-note">Note <span class="faint">(optional)</span></label><textarea id="add-note" name="note" class="textarea" rows="2" maxlength="280"></textarea></div>`
    : `<div class="dlg-empty">No shadow teams yet. <a href="#squad-shadow-teams" data-route="squad-shadow-teams">Create one in Squad › Shadow Teams</a>.</div>`;
  openDialog(`<form class="dlg-body" data-form="add-shadow">
    <h2 class="dlg-title" id="dlg-title">Add to Shadow Team</h2>
    ${playerRow}
    ${fields}
    ${dialogActions('Add', { disabled: !p || !team })}
  </form>`);
}

function writeEntries(team, entries, message) {
  if (!canAny('shadow.edit', 'shadow.addPlayers')) { toast(NO_PERMISSION, 'lock'); return; }
  ShadowTeamStore.update(team.id, { entries })
    .then(() => { if (message) toast(message, 'check'); })
    .catch(() => toast('Could not save the change. Your access may be view-only.', 'alert'));
}

function shadowMove(playerId, fromPos, toPos, index) {
  if (!can('shadow.edit')) { toast(NO_PERMISSION, 'lock'); return; }
  const team = currentTeam();
  if (!team || !toPos) return;
  if (fromPos === toPos && index === undefined) return;   // dropped on its own position
  const entries = ShadowOps.move(team, playerId, fromPos, toPos, index);
  writeEntries(team, entries, fromPos !== toPos ? `Moved to ${toPos}` : '');
}

/* ---- Player and squad dialogs ---- */
const SAVE_ERROR = 'Could not save. Your access may be view-only.';

function datalists() {
  const players = PlayerStore.list();
  const uniq = (arr) => [...new Set(arr.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  const opts = (arr) => arr.map((v) => `<option value="${esc(v)}"></option>`).join('');
  return `<datalist id="dl-countries">${opts(uniq([...COUNTRIES, ...players.map((p) => p.nationality), ...players.map((p) => p.secondNationality)].map((c) => tr(c))))}</datalist>
    <datalist id="dl-clubs">${opts(uniq([CLUB.name, ...players.map((p) => p.club), ...players.map((p) => p.contract.club)]))}</datalist>
    <datalist id="dl-competitions">${opts(uniq([CLUB.competition, ...players.map((p) => p.competition)]))}</datalist>`;
}

// Form fields. Each carries a stable id so values survive a republish.
const F = {
  text(name, label, value, { type = 'text', list, placeholder, error, extra = {} } = {}) {
    const id = `f-${name}`;
    return `<div class="field"><label for="${id}">${esc(label)}</label><input ${attrs({ id, name, type, class: 'input', value: has(value) ? value : '', list, placeholder, autocomplete: 'off', ...extra })}>${error ? `<p class="field-error" id="${id}-error" hidden>${esc(error)}</p>` : ''}</div>`;
  },
  select(name, label, value, options, { blank = true, error } = {}) {
    const id = `f-${name}`;
    return `<div class="field"><label for="${id}">${esc(label)}</label>${UI.select({ id, name, value: has(value) ? value : '', options: [...(blank ? [{ value: '', label: EMPTY }] : []), ...options] })}${error ? `<p class="field-error" id="${id}-error" hidden>${esc(error)}</p>` : ''}</div>`;
  },
  textarea(name, label, value) {
    const id = `f-${name}`;
    return `<div class="field"><label for="${id}">${esc(label)}</label><textarea id="${id}" name="${name}" class="textarea" rows="3" maxlength="2000">${esc(value || '')}</textarea></div>`;
  },
};
const todayIso = () => new Date().toISOString().slice(0, 10);
const fieldName = (p) => F.text('name', 'Name', p && p.name, { error: 'Enter the player’s name.', extra: { maxlength: 80, required: true } });
const fieldPosition = (p) => F.select('position', 'Primary position', p && p.position, PLAYER_POSITIONS.map((x) => ({ value: x.id, label: `${x.id} · ${x.label}` })));
const fieldDob = (p) => F.text('birthDate', 'Date of birth', p && p.birthDate, { type: 'date', extra: { max: todayIso() } });
const fieldNationality = (p, name = 'nationality', label = 'Nationality') => F.text(name, label, p && tr(p[name]), { list: 'dl-countries' });
const fieldClub = (p) => F.text('club', 'Club', p && p.club, { list: 'dl-clubs' });
const fieldFoot = (p) => F.select('foot', 'Preferred foot', p && p.foot, Object.entries(FEET).map(([value, label]) => ({ value, label })));
const fieldShirt = (m) => F.text('shirtNumber', 'Shirt number', m && m.shirtNumber, { type: 'number', error: 'Use a number from 1 to 99.', extra: { min: 1, max: 99, step: 1, inputmode: 'numeric' } });
const fieldSquadStatus = (m) => F.select('squadStatus', 'Status', m ? m.status : 'available', Object.entries(VOCAB.squadStatus).map(([value, [label]]) => ({ value, label })), { blank: false });
const fieldContractEnd = (p) => F.text('contractEnd', 'Contract until', p && p.contract && p.contract.endDate, { type: 'date' });

function playerFullForm(p) {
  const c = (p && p.contract) || {};
  const sec = (title, inner) => `<div class="form-section">${UI.sectionTitle(title)}${inner}</div>`;
  const secondary = `<div class="field"><span class="field-label" id="f-secondary-label">Secondary positions</span><div class="check-grid" role="group" aria-labelledby="f-secondary-label">${PLAYER_POSITIONS.map((x) => `<label class="check-chip" title="${esc(x.label)}"><input type="checkbox" id="f-sec-${x.id}" name="secondary" value="${x.id}"${p && p.secondaryPositions.includes(x.id) ? ' checked' : ''}><span>${x.id}</span></label>`).join('')}</div></div>`;
  return `
    ${sec('Profile', `
      <div class="field-row">${fieldName(p)}${F.text('fullName', 'Full name', p && p.fullName)}</div>
      <div class="field-row field-row--3">${fieldDob(p)}${F.text('heightCm', 'Height (cm)', p && p.heightCm, { type: 'number', extra: { min: 140, max: 215, step: 1 } })}${fieldFoot(p)}</div>
      <div class="field-row">${fieldNationality(p)}${fieldNationality(p, 'secondNationality', 'Second nationality')}</div>
      <div class="field-row">${fieldPosition(p)}${F.select('internalStatus', 'Internal status', p ? p.internalStatus || 'untracked' : 'untracked', INTERNAL_STATUS.map((s) => ({ value: s.id, label: s.label })), { blank: false })}</div>
      ${secondary}`)}
    ${sec('Current situation', `
      <div class="field-row">${fieldClub(p)}${F.text('competition', 'Competition', p && p.competition, { list: 'dl-competitions' })}</div>
      <div class="field-row">${F.select('squadRole', 'Squad role', p && p.squadRole, SQUAD_ROLES.map((v) => ({ value: v, label: v })))}${F.select('availability', 'Availability', p && p.availability, MARKET_AVAILABILITY.map((v) => ({ value: v, label: v })))}</div>`)}
    ${sec('Contract', `
      <div class="field-row">${F.text('c_current', 'Current contract', c.current, { placeholder: 'e.g. Signed July 2024' })}${F.text('c_endDate', 'End date', c.endDate, { type: 'date' })}</div>
      <div class="field-row">${F.text('c_option', 'Option', c.option, { placeholder: 'e.g. +1 year, club option' })}${F.text('c_club', 'Contract club', c.club, { list: 'dl-clubs' })}</div>
      <div class="field-row">${F.text('c_agent', 'Agent', c.agent)}${F.text('c_loan', 'Loan situation', c.loan)}</div>`)}
    ${p && can('financial.edit') && FinanceStore.started() ? (() => {
      const f = financeFor(p.id);
      return sec('Financial', `
      <div class="field-row">${F.text('f_marketValue', 'Market value', f.marketValue, { placeholder: 'e.g. €2.5M' })}${F.text('f_askingPrice', 'Asking price', f.askingPrice)}</div>
      <div class="field-row">${F.text('f_salary', 'Salary', f.salary)}${F.text('f_transferCost', 'Transfer cost', f.transferCost)}</div>
      ${F.textarea('f_notes', 'Financial notes', f.notes)}`);
    })() : ''}`;
}

// Reads only the fields present in the form, so short forms never erase other data.
function readPlayerForm(form) {
  const el = form.elements;
  const val = (n) => (el.namedItem(n) ? el.namedItem(n).value.trim() : undefined);
  const out = {};
  ['name', 'fullName', 'birthDate', 'nationality', 'secondNationality', 'position', 'foot', 'club', 'competition', 'squadRole', 'availability', 'internalStatus']
    .forEach((k) => { const v = val(k); if (v !== undefined) out[k] = v; });
  // Countries typed in Portuguese are stored with their English name, like the rest of the list.
  ['nationality', 'secondNationality'].forEach((k) => { if (out[k]) out[k] = fromPortuguese(out[k], COUNTRIES); });
  const h = val('heightCm');
  if (h !== undefined) out.heightCm = h === '' ? null : Number(h);
  if (form.querySelector('input[name="secondary"]')) {
    out.secondaryPositions = $$('input[name="secondary"]:checked', form).map((i) => i.value).filter((x) => x !== out.position);
  }
  const contract = {};
  ['current', 'endDate', 'option', 'club', 'agent', 'loan']
    .forEach((k) => { const v = val(`c_${k}`); if (v !== undefined) contract[k] = v; });
  const end = val('contractEnd');
  if (end !== undefined) contract.endDate = end;
  if (Object.keys(contract).length) out.contract = contract;
  return out;
}

// Financial fields of the edit form, or null when the form has none (no permission).
function readFinanceForm(form) {
  if (!form.elements.namedItem('f_marketValue')) return null;
  return Object.fromEntries(FINANCE_FIELDS.map(([k]) => { const el = form.elements.namedItem(`f_${k}`); return [k, el ? el.value.trim() : '']; }));
}

function showFieldError(input, message) {
  input.setAttribute('aria-invalid', 'true');
  const err = document.getElementById(`${input.id}-error`);
  if (err) { if (message) err.textContent = message; err.hidden = false; }
  input.focus();
}
function requireName(form) {
  const input = form.elements.namedItem('name');
  if (input && !input.value.trim()) { showFieldError(input); return false; }
  return true;
}
function checkShirt(form, playerId) {
  const input = form.elements.namedItem('shirtNumber');
  if (!input || input.value === '') return true;
  const n = Number(input.value);
  if (!Number.isInteger(n) || n < 1 || n > 99) { showFieldError(input, 'Use a number from 1 to 99.'); return false; }
  const taken = SquadStore.list().find((m) => m.shirtNumber === n && m.playerId !== playerId);
  if (taken) {
    const other = PlayerStore.get(taken.playerId);
    showFieldError(input, `Number ${n} is already worn by ${other ? other.name : 'another player'}.`);
    return false;
  }
  return true;
}
function squadBody(form, playerId) {
  const existing = SquadStore.get(playerId);
  const shirt = form.elements.namedItem('shirtNumber').value;
  return {
    playerId,
    shirtNumber: shirt === '' ? null : Number(shirt),
    status: form.elements.namedItem('squadStatus').value,
    addedAt: (existing && existing.addedAt) || new Date().toISOString(),
  };
}

function openPlayer(id) {
  state.playerId = id;
  state.profileTab = 'overview';
  navigate('player-profile');
}

function openNewPlayerDialog() {
  openDialog(`<form class="dlg-body" data-form="player-new" novalidate>
    <h2 class="dlg-title" id="dlg-title">New player</h2>
    <p class="dlg-text">Only the name is required. The rest can be completed later in the profile.</p>
    ${fieldName(null)}
    <div class="field-row">${fieldPosition(null)}${fieldDob(null)}</div>
    <div class="field-row">${fieldNationality(null)}${fieldClub(null)}</div>
    ${fieldFoot(null)}
    <div class="dlg-actions">
      <button type="button" class="btn btn--ghost" data-action="close-dialog">Cancel</button>
      <button type="submit" class="btn btn--secondary" value="another">Save and add another</button>
      <button type="submit" class="btn btn--primary" value="open">Save and open</button>
    </div>
    ${datalists()}
  </form>`);
}

function openEditPlayerDialog(p, section) {
  if (!p) return;
  openDialog(`<form class="dlg-body" data-form="player-edit" data-id="${esc(p.id)}" novalidate>
    <h2 class="dlg-title" id="dlg-title">Edit player</h2>
    <div class="dlg-scroll">${playerFullForm(p)}</div>
    ${dialogActions('Save changes')}
    ${datalists()}
  </form>`, { wide: true });
  if (section === 'contract') {
    const f = $('#f-c_current');
    if (f) { f.scrollIntoView({ block: 'center' }); f.focus({ preventScroll: true }); }
  }
}

// Positions only, opened from the profile header. Primary is a single choice; "Also plays" excludes it.
function positionChips(name, type, selected, primary) {
  return POSITION_GROUPS.filter((g) => g.id !== 'none').map((g) => `<div class="pos-line">
      <span class="pos-line__label">${esc(g.label)}</span>
      <div class="check-grid">${PLAYER_POSITIONS.filter((x) => x.group === g.id).map((x) => `<label class="check-chip" title="${esc(x.label)}"><input type="${type}" id="pos-${name}-${x.id}" name="${name}" value="${x.id}" aria-label="${esc(x.label)}"${selected.includes(x.id) ? ' checked' : ''}${type === 'checkbox' && x.id === primary ? ' disabled' : ''}><span>${x.id}</span></label>`).join('')}</div>
    </div>`).join('');
}
function positionSummary(primary, secondary) {
  if (!primary) return 'Choose the primary position.';
  return `${primary} · ${posLabel(primary)}${secondary.length ? ` — also ${secondary.map(posLabel).join(', ')}` : ''}`;
}
// Other players still without a position, in the same scope as p (our squad or the rest), by name after p.
function playersWithoutPosition(p) {
  const inSquad = !!squadMember(p.id);
  const rest = PlayerStore.list().filter((x) => x.id !== p.id && !x.position && !!squadMember(x.id) === inSquad);
  const after = rest.filter((x) => x.name.localeCompare(p.name) > 0);
  return [...after, ...rest.filter((x) => !after.includes(x))];
}
function openPositionsDialog(p) {
  if (!p) return;
  const sec = p.secondaryPositions.filter((x) => x !== p.position);
  const left = playersWithoutPosition(p).length;
  const actions = left
    ? `<div class="dlg-actions dlg-actions--split">
        <button type="button" class="btn btn--ghost" data-action="close-dialog">Cancel</button>
        <div class="dlg-actions__group">
          <button type="submit" class="btn btn--secondary" value="save">Save</button>
          <button type="submit" class="btn btn--primary" value="next" title="Save and open the next ${squadMember(p.id) ? 'squad player' : 'player'} without a position">Save and next <span class="btn__count">${left} left</span></button>
        </div>
      </div>`
    : dialogActions('Save positions');
  openDialog(`<form class="dlg-body" data-form="positions" data-id="${esc(p.id)}" novalidate>
    <div>
      <h2 class="dlg-title" id="dlg-title">Positions</h2>
      <p class="dlg-text" style="margin-top:4px">${esc(p.name)}</p>
    </div>
    <fieldset class="pos-set" data-change="pos-pick"><legend class="field-label">Primary position</legend><div class="pos-lines">${positionChips('position', 'radio', p.position ? [p.position] : [], null)}</div></fieldset>
    <fieldset class="pos-set" data-change="pos-pick"><legend class="field-label">Also plays <span class="faint">(optional)</span></legend><div class="pos-lines">${positionChips('secondary', 'checkbox', sec, p.position)}</div></fieldset>
    <p class="pos-summary" id="pos-summary" aria-live="polite">${esc(positionSummary(p.position, sec))}</p>
    ${actions}
  </form>`);
}

function openDeletePlayerDialog(p) {
  if (!p) return;
  openDialog(`<form class="dlg-body" data-form="player-delete" data-id="${esc(p.id)}">
    <h2 class="dlg-title" id="dlg-title">Delete ${esc(p.name)}?</h2>
    <p class="dlg-text">This removes the player, their squad place and any shadow-team places. It cannot be undone.</p>
    ${dialogActions('Delete player', { variant: 'danger' })}
  </form>`);
}

function openSquadNewDialog() {
  openDialog(`<form class="dlg-body" data-form="squad-new" novalidate>
    <h2 class="dlg-title" id="dlg-title">Add to the ${esc(SEASON.label)} squad</h2>
    ${fieldName(null)}
    <div class="field-row field-row--3">${fieldPosition(null)}${fieldShirt(null)}${fieldSquadStatus(null)}</div>
    <div class="field-row field-row--3">${fieldDob(null)}${fieldNationality(null)}${fieldFoot(null)}</div>
    ${fieldContractEnd(null)}
    <p class="dlg-text small">Player already in the Player Database? Open their profile and choose More actions › Add to ${esc(SEASON.label)} squad.</p>
    <div class="dlg-actions">
      <button type="button" class="btn btn--ghost" data-action="close-dialog">Cancel</button>
      <button type="submit" class="btn btn--secondary" value="another">Save and add another</button>
      <button type="submit" class="btn btn--primary" value="done">Save</button>
    </div>
    ${datalists()}
  </form>`, { wide: true });
}

function openSquadMemberDialog(p) {
  if (!p) return;
  const m = squadMember(p.id);
  openDialog(`<form class="dlg-body" data-form="squad-member" data-id="${esc(p.id)}" novalidate>
    <h2 class="dlg-title" id="dlg-title">${m ? 'Squad details' : `Add to the ${esc(SEASON.label)} squad`}</h2>
    <p class="dlg-text">${esc(p.name)}</p>
    <div class="field-row field-row--3">${fieldShirt(m)}${fieldSquadStatus(m)}${fieldContractEnd(p)}</div>
    <div class="dlg-actions dlg-actions--split">
      <div>${m ? `<button type="button" class="btn btn--ghost" data-action="squad-remove" data-id="${esc(p.id)}">${icon('x')}Remove from squad</button>` : ''}</div>
      <div class="dlg-actions__group">
        <button type="button" class="btn btn--ghost" data-action="close-dialog">Cancel</button>
        <button type="submit" class="btn btn--primary">${m ? 'Save' : 'Add to squad'}</button>
      </div>
    </div>
  </form>`);
}

/* ---- Recruitment need dialogs ---- */
function openNeedDialog(need = null, presetPos = '') {
  const n = need || { position: presetPos, priority: 'medium', window: 'summer-2027', status: 'open', reasons: [], dealType: 'any', profile: '', notes: '', ageMin: null, ageMax: null, relatedPlayerId: '' };
  const squadOptions = SquadStore.list().map((m) => PlayerStore.get(m.playerId)).filter(Boolean)
    .sort((a, b) => a.name.localeCompare(b.name)).map((p) => ({ value: p.id, label: `${p.name}${p.position ? ` · ${p.position}` : ''}` }));
  const reasons = `<div class="field"><span class="field-label" id="f-reasons-label">Reasons</span><div class="check-grid check-grid--wide" role="group" aria-labelledby="f-reasons-label">${NEED_REASONS.map((r) => `<label class="check-chip"><input type="checkbox" id="f-reason-${r.id}" name="reason" value="${r.id}"${n.reasons.includes(r.id) ? ' checked' : ''}><span>${esc(r.label)}</span></label>`).join('')}</div></div>`;
  openDialog(`<form class="dlg-body" data-form="need"${need ? ` data-id="${esc(need.id)}"` : ''} novalidate>
    <h2 class="dlg-title" id="dlg-title">${need ? 'Edit need' : 'New recruitment need'}</h2>
    <div class="dlg-scroll"><div class="form-section">
      <div class="field-row field-row--3">
        ${F.select('position', 'Position', n.position, PLAYER_POSITIONS.map((x) => ({ value: x.id, label: `${x.id} · ${x.label}` })), { error: 'Choose a position.' })}
        ${F.select('priority', 'Priority', n.priority, Object.entries(VOCAB.priority).map(([value, label]) => ({ value, label })), { blank: false })}
        ${F.select('window', 'Window', n.window, NEED_WINDOWS.map((w) => ({ value: w.id, label: w.label })), { blank: false })}
      </div>
      ${F.text('profile', 'Profile wanted', n.profile, { placeholder: 'e.g. Left-footed, comfortable building from the back', extra: { maxlength: 140 } })}
      ${reasons}
      <div class="field-row field-row--3">
        ${F.select('dealType', 'Deal type', n.dealType, Object.entries(DEAL_TYPES).map(([value, label]) => ({ value, label })), { blank: false })}
        ${F.text('ageMin', 'Age from', n.ageMin, { type: 'number', extra: { min: 15, max: 40, step: 1 } })}
        ${F.text('ageMax', 'Age to', n.ageMax, { type: 'number', error: 'Age to must be at least Age from.', extra: { min: 15, max: 40, step: 1 } })}
      </div>
      <div class="field-row">
        ${F.select('relatedPlayerId', 'Related squad player', n.relatedPlayerId, squadOptions)}
        ${need ? F.select('status', 'Status', n.status, Object.entries(VOCAB.needStatus).map(([value, [label]]) => ({ value, label })), { blank: false }) : ''}
      </div>
      ${F.textarea('notes', 'Notes', n.notes)}
    </div></div>
    ${dialogActions(need ? 'Save changes' : 'Create need')}
  </form>`, { wide: true });
}

function readNeedForm(form) {
  const v = (k) => (form.elements.namedItem(k) ? form.elements.namedItem(k).value.trim() : undefined);
  const out = {
    position: v('position'), priority: v('priority'), window: v('window'), profile: v('profile'),
    dealType: v('dealType'), ageMin: numOrNull(v('ageMin')), ageMax: numOrNull(v('ageMax')),
    relatedPlayerId: v('relatedPlayerId') || '', notes: v('notes'),
    reasons: $$('input[name="reason"]:checked', form).map((i) => i.value),
  };
  if (v('status')) out.status = v('status');
  return out;
}

function openDeleteNeedDialog(n) {
  if (!n) return;
  openDialog(`<form class="dlg-body" data-form="need-delete" data-id="${esc(n.id)}">
    <h2 class="dlg-title" id="dlg-title">Delete this need?</h2>
    <p class="dlg-text">${esc(needLabel(n))}. Its candidate list is removed; the players stay in the Player Database.</p>
    ${dialogActions('Delete need', { variant: 'danger' })}
  </form>`);
}

function pickerResults(need) {
  const q = normText(state.needs.pickQ.trim());
  const taken = new Set(need.candidates.map((c) => c.playerId));
  const fit = (p) => (p.position === need.position ? 0 : p.secondaryPositions.includes(need.position) ? 1 : 2);
  const all = PlayerStore.list().filter((p) => !squadMember(p.id) && !taken.has(p.id));
  const list = all.filter((p) => !q || searchTerms([p.name, p.fullName, p.club, p.nationality, p.position, posLabel(p.position)]).some((x) => normText(x).includes(q)))
    .sort((a, b) => fit(a) - fit(b) || a.name.localeCompare(b.name)).slice(0, 30);
  if (!list.length) {
    return UI.emptyState({ size: 'sm', iconName: 'search', title: all.length ? 'No matching players' : 'No external players in the Player Database yet' });
  }
  return `<ul>${list.map((p) => `<li class="pick-row">${playerLine(p, playerFacts(p), { link: false })}${UI.btn({ label: 'Add', iconName: 'plus', action: 'need-pick', data: { 'data-player': p.id }, cls: 'btn--sm' })}</li>`).join('')}</ul>`;
}

function openCandidatePicker(need) {
  if (!need) return;
  state.needs.pickQ = '';
  openDialog(`<div class="dlg-body">
    <div><h2 class="dlg-title" id="dlg-title">Add candidate</h2><p class="dlg-text">${esc(needLabel(need))}</p></div>
    <label class="search search--full" for="pick-q">${icon('search')}<span class="sr-only">Search players</span><input id="pick-q" class="input" type="search" data-input="need-pick-search" placeholder="Search name, club, nationality" autocomplete="off"></label>
    <div id="pick-results" class="pick-list">${pickerResults(need)}</div>
    <p class="dlg-text small">Players matching the position are listed first. Not in the list? Add them in the Player Database.</p>
    <div class="dlg-actions"><button type="button" class="btn btn--secondary" data-action="close-dialog">Done</button></div>
  </div>`, { wide: true });
}

async function addCandidate(needId, playerId) {
  const need = NeedStore.get(needId);
  if (!need || need.candidates.some((c) => c.playerId === playerId)) return false;
  await NeedStore.update(need.id, { candidates: [...need.candidates, { playerId, addedAt: new Date().toISOString() }] });
  return true;
}

function openLinkNeedDialog(p) {
  if (!p) return;
  const active = seasonNeeds().filter(isActiveNeed).sort(needCompare);
  const linked = new Set(needsForPlayer(p.id).map((n) => n.id));
  const options = active.filter((n) => !linked.has(n.id));
  const best = options.find((n) => n.position === p.position) || options.find((n) => p.secondaryPositions.includes(n.position)) || options[0];
  let body;
  if (!active.length) body = `<div class="dlg-empty">No active needs yet. <a href="#squad-needs" data-route="squad-needs">Create one in Squad › Recruitment Needs</a>.</div>`;
  else if (!options.length) body = `<div class="dlg-empty">${esc(p.name)} is already a candidate for every active need.</div>`;
  else body = `<div class="field"><label for="link-need">Need</label>${UI.select({ id: 'link-need', name: 'need', value: best.id, options: options.map((n) => ({ value: n.id, label: `${needLabel(n)}${n.profile ? ` · ${n.profile}` : ''}` })) })}</div>`;
  openDialog(`<form class="dlg-body" data-form="link-need" data-player="${esc(p.id)}">
    <h2 class="dlg-title" id="dlg-title">Add to Shortlist</h2>
    <div class="dlg-player"><span class="avatar">${esc(initials(p.name))}</span><div><div class="cell-strong">${esc(p.name)}</div><div class="cell-sub">${esc(playerFacts(p))}</div></div></div>
    ${options.length ? `<p class="dlg-text">Each recruitment need keeps its own shortlist: its candidates. ${esc(p.name)}’s internal status becomes Shortlisted.</p>` : ''}
    ${body}
    ${dialogActions('Add to shortlist', { disabled: !options.length })}
  </form>`);
}

/* ---- Scouting dialogs ---- */
function scaleField(name, label, options, value, { compact = false } = {}) {
  return `<fieldset class="scale" id="f-${name}" data-scale="${name}">
    <legend class="field-label">${esc(label)}</legend>
    <div class="scale__opts${compact ? ' scale__opts--compact' : ''}">${options.map((o) => `<label class="scale__opt" title="${esc(`${o.v} · ${o.label}`)}"><input type="radio" name="${name}" value="${o.v}"${Number(value) === o.v ? ' checked' : ''}><span><b>${o.v}</b><small>${esc(o.label)}</small></span></label>`).join('')}</div>
    <p class="field-error" id="f-${name}-error" hidden>Choose a value.</p>
  </fieldset>`;
}
function gradeRow(name, label, value, extra = '') {
  return `<div class="grade-row" id="f-${name}" ${extra}>
    <span class="grade-row__label">${esc(label)}</span>
    <div class="scale__opts scale__opts--compact" role="radiogroup" aria-label="${esc(label)}">${GRADES.map((g) => `<label class="scale__opt" title="${esc(`${g.v} · ${g.label}`)}"><input type="radio" name="${name}" value="${g.v}"${Number(value) === g.v ? ' checked' : ''}><span><b>${g.v}</b><small>${esc(g.label)}</small></span></label>`).join('')}</div>
    <p class="field-error" id="f-${name}-error" hidden>Choose a grade.</p>
  </div>`;
}
function attributeRows(pos, existing = []) {
  const names = attributesFor(pos);
  if (!names.length) return '<p class="small faint">Choose the position played to grade its attributes.</p>';
  const score = (n) => (existing.find((a) => a.name === n) || {}).score;
  return names.map((n, i) => gradeRow(`attr_${i}`, n, score(n), `data-attr-name="${esc(n)}"`)).join('');
}

// New or edited report. opts: { type, report, prefill: { scout, match, needId }, requestId }
function openReportDialog(p, opts = {}) {
  if (!p) return;
  const r = opts.report || null;
  const pre = opts.prefill || {};
  const candidateOf = needsForPlayer(p.id).filter(isActiveNeed);
  const needId = r ? r.needId : (pre.needId || (candidateOf[0] ? candidateOf[0].id : ''));
  const type = needId ? 'full' : (r ? r.type : (opts.type || 'quick'));
  const full = type === 'full';
  const pos = r ? r.positionPlayed : (p.position || '');
  const needOptions = seasonNeeds().filter((n) => isActiveNeed(n) || n.id === needId).sort((a, b) => {
    const rank = (n) => (candidateOf.some((c) => c.id === n.id) ? 0 : n.position === p.position ? 1 : 2);
    return rank(a) - rank(b) || needCompare(a, b);
  }).map((n) => ({ value: n.id, label: `${needLabel(n)}${n.profile ? ` · ${n.profile}` : ''}` }));
  const comps = `<datalist id="dl-comps">${[...new Set([CLUB.competition, ...ReportStore.list().map((x) => x.competition), ...PlayerStore.list().map((x) => x.competition)].filter(Boolean))].map((x) => `<option value="${esc(x)}"></option>`).join('')}</datalist>`;
  const radio = (name, value, label, checked, disabled = false) => `<label class="seg__opt"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}${disabled ? ' disabled' : ''}><span>${esc(label)}</span></label>`;
  const recs = `<fieldset class="scale" id="f-recommendation"><legend class="field-label">Recommendation</legend>
    <div class="rec-opts">${RECOMMENDATIONS.map((x) => `<label class="rec-opt rec-opt--${x.tone}"><input type="radio" name="recommendation" value="${x.id}"${r && r.recommendation === x.id ? ' checked' : ''} data-change="rp-rec"><span><b>${esc(x.label)}</b><small>${esc(x.action)}</small></span></label>`).join('')}</div>
    <p class="field-error" id="f-recommendation-error" hidden>Choose a recommendation.</p>
  </fieldset>`;
  const three = (name, list) => [0, 1, 2].map((i) => `<label class="sr-only" for="f-${name}_${i}">${name === 'strength' ? 'Strength' : 'Concern'} ${i + 1}</label><input id="f-${name}_${i}" name="${name}_${i}" class="input" maxlength="120" autocomplete="off" value="${esc(list[i] || '')}" placeholder="${i === 0 ? (name === 'strength' ? 'e.g. Reads the game early' : 'e.g. Struggles against pace') : ''}">`).join('');

  openDialog(`<form class="dlg-body" data-form="report" data-player="${esc(p.id)}"${r ? ` data-id="${esc(r.id)}"` : ''}${r && r.scout ? ` data-scout="${esc(r.scout)}"` : ''}${opts.requestId ? ` data-request="${esc(opts.requestId)}"` : ''} novalidate>
    <div class="dlg-titlebar">
      <h2 class="dlg-title" id="dlg-title">${r ? 'Edit report' : 'New report'}</h2>
      <div class="seg" role="radiogroup" aria-label="Report type" data-change="rp-type">${radio('type', 'quick', 'Quick', !full, !!needId)}${radio('type', 'full', 'Full', full)}</div>
    </div>
    <div class="dlg-player"><span class="avatar">${esc(initials(p.name))}</span><div><div class="cell-strong">${esc(p.name)}</div><div class="cell-sub">${esc(playerFacts(p) || 'No details yet')}</div></div></div>
    <div class="dlg-scroll">
      <div class="form-section">
        <div class="field">
          <label for="f-needId">Linked need</label>
          ${UI.select({ id: 'f-needId', name: 'needId', change: 'rp-need', value: needId, options: [{ value: '', label: 'None' }, ...needOptions] })}
          <p class="small faint" id="rp-need-hint"${needId ? '' : ' hidden'}>A report linked to a need is always a full report.</p>
        </div>
        <div class="field-row">
          ${F.text('date', 'Date', r ? r.date : todayIso(), { type: 'date', error: 'Enter the date of the observation.', extra: { max: todayIso() } })}
          <div class="field"><span class="field-label">Seen</span><div class="seg" role="radiogroup" aria-label="Seen">${radio('venue', 'live', 'Live', !r || r.venue === 'live')}${radio('venue', 'video', 'Video', r && r.venue === 'video')}</div></div>
        </div>
        <div class="field-row field-row--3">
          ${F.text('match', 'Match', r ? r.match : (pre.match || ''), { placeholder: 'e.g. Home v Away', extra: { maxlength: 80 } })}
          ${F.text('competition', 'Competition', r ? r.competition : '', { list: 'dl-comps', extra: { maxlength: 60 } })}
          <div class="field"><label for="f-positionPlayed">Position played</label>${UI.select({ id: 'f-positionPlayed', name: 'positionPlayed', change: 'rp-pos', value: pos, options: [{ value: '', label: EMPTY }, ...PLAYER_POSITIONS.map((x) => ({ value: x.id, label: `${x.id} · ${x.label}` }))] })}</div>
        </div>
        <div data-full${full ? '' : ' hidden'}>${F.text('minutes', 'Minutes watched', r ? r.minutes : '', { type: 'number', extra: { min: 0, max: 150, step: 1 } })}</div>
      </div>
      <div class="form-section">
        ${UI.sectionTitle('Level')}
        ${scaleField('levelNow', 'Current level', LEVELS, r && r.levelNow)}
        ${scaleField('levelPotential', 'Potential in 2 seasons', LEVELS, r && r.levelPotential)}
      </div>
      <div class="form-section" data-full${full ? '' : ' hidden'}>
        ${UI.sectionTitle('Dimensions')}
        ${DIMENSIONS.map((d) => gradeRow(`dim_${d.id}`, d.label, r && r.dimensions[d.id])).join('')}
        ${UI.sectionTitle('Position attributes')}
        <div id="rp-attrs">${attributeRows(pos, r ? r.attributes : [])}</div>
      </div>
      <div class="form-section">
        ${recs}
        <div class="field" id="rp-close"${r && r.recommendation === 'no' ? '' : ' hidden'}><label for="f-closeReason">Reason</label>${UI.select({ id: 'f-closeReason', name: 'closeReason', value: r ? r.closeReason : '', options: [{ value: '', label: EMPTY }, ...Object.entries(CLOSE_REASONS).map(([value, label]) => ({ value, label }))] })}<p class="field-error" id="f-closeReason-error" hidden>Choose a reason.</p></div>
        <div class="field">
          <label for="f-summary">Summary</label>
          <textarea id="f-summary" name="summary" class="textarea" rows="${full ? 5 : 3}" maxlength="${full ? 2000 : 280}" placeholder="${full ? 'What the player showed, and how he fits' : '1 to 3 lines'}">${esc(r ? r.summary : '')}</textarea>
        </div>
      </div>
      <div class="form-section" data-full${full ? '' : ' hidden'}>
        <div class="field-row">
          <div class="field"><span class="field-label">Strengths</span><div class="stack">${three('strength', r ? r.strengths : [])}</div></div>
          <div class="field"><span class="field-label">Concerns</span><div class="stack">${three('concern', r ? r.concerns : [])}</div></div>
        </div>
      </div>
    </div>
    ${dialogActions(r ? 'Save changes' : 'Save report')}
    ${comps}
  </form>`, { wide: true });
}

function setReportType(form, type) {
  const full = type === 'full';
  $$('[data-full]', form).forEach((el) => { el.hidden = !full; });
  const summary = form.querySelector('#f-summary');
  if (summary) {
    summary.maxLength = full ? 2000 : 280;
    summary.rows = full ? 5 : 3;
    summary.placeholder = full ? 'What the player showed, and how he fits' : '1 to 3 lines';
  }
}

function readReportForm(form) {
  const val = (n) => { const el = form.elements.namedItem(n); return el && typeof el.value === 'string' ? el.value.trim() : ''; };
  const radio = (n) => { const el = form.querySelector(`input[name="${n}"]:checked`); return el ? el.value : ''; };
  const type = radio('type') || 'quick';
  const out = {
    type, needId: val('needId'), date: val('date'), venue: radio('venue') || 'live',
    match: val('match'), competition: val('competition'), positionPlayed: val('positionPlayed'),
    levelNow: numOrNull(radio('levelNow')), levelPotential: numOrNull(radio('levelPotential')),
    recommendation: radio('recommendation'), summary: val('summary'),
  };
  out.closeReason = out.recommendation === 'no' ? val('closeReason') : '';
  if (type === 'full') {
    out.minutes = numOrNull(val('minutes'));
    out.dimensions = Object.fromEntries(DIMENSIONS.map((d) => [d.id, numOrNull(radio(`dim_${d.id}`))]));
    out.attributes = $$('[data-attr-name]', form).map((row, i) => ({ name: row.dataset.attrName, score: numOrNull(radio(`attr_${i}`)) })).filter((a) => a.score !== null);
    out.strengths = [0, 1, 2].map((i) => val(`strength_${i}`)).filter(Boolean);
    out.concerns = [0, 1, 2].map((i) => val(`concern_${i}`)).filter(Boolean);
  } else {
    Object.assign(out, { minutes: null, dimensions: {}, attributes: [], strengths: [], concerns: [] });
  }
  return out;
}

function validateReport(form, data) {
  const errors = [];
  const flag = (id) => { const e = document.getElementById(`${id}-error`); if (e) e.hidden = false; errors.push(id); };
  $$('.field-error', form).forEach((e) => { e.hidden = true; });
  if (!data.date) flag('f-date');
  if (data.levelNow === null) flag('f-levelNow');
  if (data.levelPotential === null) flag('f-levelPotential');
  if (data.type === 'full') DIMENSIONS.forEach((d) => { if (data.dimensions[d.id] === null) flag(`f-dim_${d.id}`); });
  if (!data.recommendation) flag('f-recommendation');
  if (data.recommendation === 'no' && !data.closeReason) flag('f-closeReason');
  if (errors.length) {
    const first = document.getElementById(errors[0]);
    if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
    return false;
  }
  return true;
}

// Who may carry out the step a recommendation proposes.
const nextStepAllowed = (r) => !!r && ({ sign: can('shortlists.create'), again: can('assignments.viewOwn') }[r.recommendation] ?? can('players.edit'));

// After a new report: propose the next step for its recommendation; the user confirms or skips.
function openNextStep(reportId) {
  const r = ReportStore.get(reportId);
  const p = r && PlayerStore.get(r.playerId);
  if (!r || !p) return;
  const rec = RECOMMENDATION[r.recommendation];
  const inDays = (n) => new Date(Date.now() + n * 864e5).toISOString().slice(0, 10);
  let body = '';
  let canConfirm = true;
  if (!nextStepAllowed(r)) {
    body = `<p class="dlg-text">This step is done by someone with permission to ${rec.id === 'sign' ? 'add players to shortlists' : rec.id === 'again' ? 'plan assignments' : 'edit players'}. Your report is saved.</p>`;
    canConfirm = false;
  } else if (rec.id === 'sign') {
    const active = seasonNeeds().filter(isActiveNeed).sort(needCompare);
    const already = new Set(needsForPlayer(p.id).map((n) => n.id));
    const def = (r.needId && active.find((n) => n.id === r.needId)) || active.find((n) => n.position === p.position && !already.has(n.id)) || active[0];
    if (!active.length) { body = `<div class="dlg-empty">There are no active needs yet. <a href="#squad-needs" data-route="squad-needs">Create one in Recruitment Needs</a> and add ${esc(p.name)} as a candidate.</div>`; canConfirm = false; }
    else body = `<p class="dlg-text">${esc(p.name)} joins the need’s candidates, which act as its shortlist, and his internal status becomes Shortlisted.</p><div class="field"><label for="ns-need">Need</label>${UI.select({ id: 'ns-need', name: 'need', value: def.id, options: active.map((n) => ({ value: n.id, label: `${needLabel(n)}${already.has(n.id) ? ' · already a candidate' : ''}` })) })}</div>`;
  } else if (rec.id === 'again') {
    body = `<p class="dlg-text">Creates an assignment for you to watch ${esc(p.name)} again, in Scouting › Assignments.</p>
      ${F.text('ns_due', 'Watch by', inDays(14), { type: 'date' })}
      ${F.text('ns_match', 'Match', '', { placeholder: 'Optional', extra: { maxlength: 80 } })}
      ${F.text('ns_note', 'Note', '', { placeholder: 'What to look at next time', extra: { maxlength: 140 } })}
`;
  } else if (rec.id === 'monitor') {
    body = `<p class="dlg-text">${esc(p.name)}’s internal status becomes Monitoring, with a date to review him again.</p>${F.text('ns_review', 'Review on', inDays(60), { type: 'date' })}`;
  } else {
    const need = r.needId ? NeedStore.get(r.needId) : null;
    body = `<p class="dlg-text">${esc(p.name)} is marked as not for us (${esc(CLOSE_REASONS[r.closeReason] || 'no reason')}).${need ? ` He is also removed from the candidates for ${esc(needLabel(need))}.` : ''} You can reopen him from his profile.</p>`;
  }
  openDialog(`<form class="dlg-body" data-form="next-step" data-report="${esc(r.id)}">
    <p class="ns-saved">${icon('check')}Report saved</p>
    <div><p class="field-label">Next step · ${recChip(rec.id)}</p><h2 class="dlg-title" id="dlg-title">${esc(rec.action)}</h2></div>
    ${body}
    <div class="dlg-actions"><button type="button" class="btn btn--ghost" data-action="close-dialog">Skip</button><button type="submit" class="btn btn--primary"${canConfirm ? '' : ' disabled'}>Confirm</button></div>
  </form>`);
}

function openReportView(id) {
  const r = ReportStore.get(id);
  if (!r) return;
  const p = PlayerStore.get(r.playerId);
  openDialog(`<div class="dlg-body">
    <div class="dlg-titlebar"><h2 class="dlg-title" id="dlg-title">${esc(p ? p.name : 'Report')}</h2>${typeChip(r.type)}</div>
    <div class="dlg-scroll">${reportDetailHtml(r)}</div>
    <div class="dlg-actions">${p ? UI.btn({ label: 'Open profile', variant: 'ghost', action: 'open-player', data: { 'data-id': p.id } }) : ''}<button type="button" class="btn btn--secondary" data-action="close-dialog">Close</button></div>
  </div>`, { wide: true });
}

function openDeleteReportDialog(id) {
  const r = ReportStore.get(id);
  if (!r) return;
  const p = PlayerStore.get(r.playerId);
  openDialog(`<form class="dlg-body" data-form="report-delete" data-id="${esc(id)}">
    <h2 class="dlg-title" id="dlg-title">Delete this report?</h2>
    <p class="dlg-text">${esc([p && p.name, fmtDate(r.date), showAuthors() ? authorName(r.authorId, r.scout) : ''].filter(Boolean).join(' · '))}. This cannot be undone.</p>
    ${dialogActions('Delete report', { variant: 'danger' })}
  </form>`);
}

// New report: choose a player from the Player Database, or add one that is not there yet.
const playersMatching = (raw, limit) => {
  const q = normText(String(raw || '').trim());
  return PlayerStore.list().filter((p) => !q || searchTerms([p.name, p.fullName, p.club, p.nationality, p.position]).some((x) => normText(x).includes(q))).slice(0, limit);
};
function pickPlayerResults() {
  const list = playersMatching(state.pick.q, 40);
  if (!list.length) return UI.emptyState({ size: 'sm', iconName: 'search', title: PlayerStore.list().length ? 'No matching players' : 'The Player Database is empty' });
  return `<ul>${list.map((p) => `<li class="pick-row">${playerLine(p, playerFacts(p), { link: false })}${UI.btn({ label: 'Choose', action: 'pick-player', data: { 'data-player': p.id }, cls: 'btn--sm' })}</li>`).join('')}</ul>`;
}
function pickNewRow() {
  if (!can('players.create')) return '<p class="dlg-text small">Not in the list? Someone with permission to add players must add them first.</p>';
  const raw = state.pick.q.trim();
  return `<div class="pick-new"><span>Not in the list?</span>${UI.btn({ label: raw ? `Add “${raw}” as a new player` : 'Add a new player', iconName: 'plus', action: 'pick-new-player', cls: 'btn--sm' })}</div>`;
}
function openPlayerPicker(next = 'report', q = '') {
  state.pick = { q, next };
  openDialog(`<div class="dlg-body">
    <h2 class="dlg-title" id="dlg-title">New report</h2>
    <label class="search search--full" for="pick-player-q">${icon('search')}<span class="sr-only">Search players</span><input id="pick-player-q" class="input" type="search" data-input="pick-player-search" placeholder="Search the Player Database" value="${esc(q)}" autocomplete="off"></label>
    <div id="pick-player-results" class="pick-list">${pickPlayerResults()}</div>
    <div id="pick-player-new">${pickNewRow()}</div>
    <div class="dlg-actions"><button type="button" class="btn btn--ghost" data-action="close-dialog">Cancel</button></div>
  </div>`, { wide: true });
}
// A player who is not in the Player Database yet: the essentials, then straight to the report.
function openPickNewPlayer() {
  const name = state.pick ? state.pick.q.trim() : '';
  openDialog(`<form class="dlg-body" data-form="pick-player-new" novalidate>
    <h2 class="dlg-title" id="dlg-title">New player</h2>
    <p class="dlg-text">The player is added to the Player Database. Only the name is required.</p>
    ${fieldName({ name })}
    <div class="field-row">${fieldPosition(null)}${fieldDob(null)}</div>
    <div class="field-row">${fieldNationality(null)}${fieldClub(null)}</div>
    <div class="dlg-actions">
      <button type="button" class="btn btn--ghost" data-action="pick-back">Back</button>
      <button type="submit" class="btn btn--primary">Save and write report</button>
    </div>
    ${datalists()}
  </form>`);
}

/* Assignments: one short form. Player (from the database, or a new name), scout, date, match, note.
   The scout is a member of the platform, or any other scout by name (someone who does not use it). */
const OTHER_SCOUT = '__other';
const canAssignOthers = () => canAny('assignments.create', 'assignments.manage');
function assigneeField(req) {
  if (!canAssignOthers()) return '';
  const ids = [ownerId(), Viewer.id, ...activeMembers().filter((m) => effectivePermissions(m.role, m.overrides).has('assignments.viewOwn')).map((m) => m.userId)];
  const options = [...new Set(ids.filter(Boolean))].map((id) => ({ value: id, label: `${personName(id)}${id === Viewer.id ? ' (you)' : ''}` }));
  if (!Viewer.id) options.unshift({ value: '', label: `${Viewer.name || OWNER_NAME} (you)` });   // without a platform account (local copy)
  const external = !!req && !req.assigneeId && !!req.scout;
  const value = external ? OTHER_SCOUT : req ? (req.assigneeId || ownerId() || '') : (Viewer.id || '');
  const names = [...new Set(RequestStore.list().map((r) => r.scout).filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return `<div class="field"><label for="f-rq_assignee">Scout</label>${UI.select({ id: 'f-rq_assignee', name: 'rq_assignee', change: 'rq-assignee', value, options: [...options, { value: OTHER_SCOUT, label: 'Other scout…' }] })}</div>
    <div class="field" id="rq-scout-field"${external ? '' : ' hidden'}><label for="f-rq_scout">Scout name</label><input id="f-rq_scout" class="input" name="rq_scout" maxlength="60" autocomplete="off" list="dl-rq-scouts" value="${esc(external ? req.scout : '')}"><p class="field-error" id="f-rq_scout-error" hidden>Enter the scout’s name.</p><datalist id="dl-rq-scouts">${names.map((n) => `<option value="${esc(n)}"></option>`).join('')}</datalist></div>`;
}
// The chosen player, or the name of a new one, with a way to change it.
function rqPicked(p, newName = '') {
  const name = p ? p.name : newName;
  const sub = p ? (playerFacts(p) || 'No details yet') : 'Added to the Player Database when you save.';
  return `<div class="dlg-player"><span class="avatar">${esc(initials(name))}</span><div><div class="cell-strong">${esc(name)}</div><div class="cell-sub">${esc(sub)}</div></div>${UI.btn({ label: 'Change', variant: 'ghost', action: 'rq-player-change', cls: 'btn--sm' })}</div>`;
}
function rqSuggestions(raw) {
  const q = String(raw || '').trim();
  if (!q) return '';
  const list = playersMatching(q, 6);
  const exact = PlayerStore.list().some((p) => normText(p.name) === normText(q) || normText(p.fullName) === normText(q));
  const rows = list.map((p) => `<button type="button" class="rq-sug" data-action="rq-player-choose" data-player="${esc(p.id)}"><span class="avatar">${esc(initials(p.name))}</span><span><span class="cell-strong">${esc(p.name)}</span><span class="cell-sub">${esc(playerFacts(p) || '')}</span></span></button>`).join('');
  const add = can('players.create') && !exact ? `<button type="button" class="rq-sug rq-sug--new" data-action="rq-player-new">${icon('plus')}<span>New player: “${esc(q)}”</span></button>` : '';
  return rows + add;
}
function openRequestDialog(p = null, req = null) {
  openDialog(`<form class="dlg-body" data-form="request"${req ? ` data-id="${esc(req.id)}"` : ''} novalidate>
    <h2 class="dlg-title" id="dlg-title">${req ? 'Edit assignment' : 'New assignment'}</h2>
    <div class="field">
      <span class="field-label">Player</span>
      <input type="hidden" name="rq_player" value="${esc(p ? p.id : '')}"><input type="hidden" name="rq_new" value="">
      <div id="rq-picked"${p ? '' : ' hidden'}>${p ? rqPicked(p) : ''}</div>
      <div id="rq-search"${p ? ' hidden' : ''}>
        <label class="search search--full" for="rq-player-q">${icon('search')}<span class="sr-only">Player</span><input id="rq-player-q" class="input" type="search" name="rq_player_q" data-input="rq-player-search" placeholder="Search or type a new name" autocomplete="off"${p ? ' disabled' : ''}></label>
        <div id="rq-player-results" class="rq-suggest"></div>
      </div>
      <p class="field-error" id="rq-player-q-error" hidden>Choose a player or type a name.</p>
    </div>
    <div class="field-row">${assigneeField(req)}${F.text('rq_due', 'Watch by', req ? req.dueBy : new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10), { type: 'date' })}</div>
    ${F.text('rq_match', 'Match', req ? req.match : '', { placeholder: 'Optional', extra: { maxlength: 80 } })}
    ${F.text('rq_note', 'Note', req ? req.note : '', { placeholder: 'What to look at', extra: { maxlength: 140 } })}
    ${dialogActions(req ? 'Save changes' : 'Create assignment')}
  </form>`);
}
// Choosing in the form: a player from the list, or a new name.
function rqSetPlayer(form, p, newName = '') {
  form.elements.namedItem('rq_player').value = p ? p.id : '';
  form.elements.namedItem('rq_new').value = p ? '' : newName;
  const picked = $('#rq-picked', form); const search = $('#rq-search', form); const q = $('#rq-player-q', form);
  const chosen = !!(p || newName);
  picked.innerHTML = chosen ? rqPicked(p, newName) : '';
  picked.hidden = !chosen;
  search.hidden = chosen;
  q.disabled = chosen;
  $('#rq-player-q-error', form).hidden = true;
  if (!chosen) { q.value = ''; $('#rq-player-results', form).innerHTML = ''; q.focus(); }
}

/* ---- Import players from a file ----
   Reads .xlsx (first sheet) and .csv, or rows pasted from a spreadsheet.
   No external library: xlsx files are unzipped with the browser's
   DecompressionStream, and the template is written as a plain zip. */
const IMPORT_MAX_ROWS = 500;
const normKey = (s) => normText(s).replace(/[^a-z0-9#º]+/g, ' ').trim();
class ImportError extends Error {}

const POSITION_ALIASES = (() => {
  const m = {};
  const add = (code, list) => list.forEach((k) => { m[normKey(k)] = code; });
  PLAYER_POSITIONS.forEach((p) => add(p.id, [p.id, p.label]));
  add('GK', ['GR', 'guarda-redes', 'guarda redes', 'goleiro', 'goalkeeper', 'keeper']);
  add('RB', ['DD', 'LD', 'lateral direito', 'defesa direito', 'right back']);
  add('CB', ['DC', 'LCB', 'RCB', 'defesa central', 'central', 'zagueiro', 'centre back', 'center back', 'center-back']);
  add('LB', ['DE', 'LE', 'lateral esquerdo', 'defesa esquerdo', 'left back']);
  add('RWB', ['ALD', 'ala direito', 'right wing back']);
  add('LWB', ['ALE', 'ala esquerdo', 'left wing back']);
  add('DM', ['MDC', 'CDM', 'medio defensivo', 'trinco', 'pivot', 'volante', 'defensive midfield']);
  add('CM', ['MC', 'LCM', 'RCM', 'medio centro', 'medio', 'central midfield', 'midfielder']);
  add('AM', ['MCO', 'MO', 'CAM', 'medio ofensivo', 'meia', 'attacking midfield']);
  add('RM', ['MD', 'medio direito', 'right midfield']);
  add('LM', ['ME', 'medio esquerdo', 'left midfield']);
  add('RW', ['ED', 'extremo direito', 'ponta direita', 'right wing']);
  add('LW', ['EE', 'extremo esquerdo', 'ponta esquerda', 'left wing']);
  add('ST', ['PL', 'AV', 'CF', 'FW', 'avancado', 'ponta de lanca', 'avancado centro', 'centroavante', 'atacante', 'forward', 'centre forward', 'center forward']);
  return m;
})();
const aliasMap = (groups) => {
  const m = {};
  Object.entries(groups).forEach(([id, list]) => list.forEach((k) => { m[normKey(k)] = id; }));
  return m;
};
const FOOT_ALIASES = aliasMap({
  right: ['right', 'r', 'd', 'direito', 'dir', 'destro'],
  left: ['left', 'l', 'e', 'esquerdo', 'esq', 'canhoto'],
  both: ['both', 'ambos', 'ambidextrous', 'ambidestro', 'r/l', 'l/r'],
});
const SQUAD_STATUS_ALIASES = aliasMap({
  available: ['available', 'disponivel', 'apto', 'fit'],
  doubtful: ['doubtful', 'duvida', 'duvidoso', 'em duvida'],
  injured: ['injured', 'lesionado', 'lesao'],
  suspended: ['suspended', 'suspenso', 'castigado'],
  loan: ['on loan', 'loan', 'emprestado', 'cedido', 'emprestimo'],
});

const asText = (v) => ({ value: v === null || v === undefined ? '' : String(v).trim().slice(0, 120) });
function parseDate(v, kind) {
  if (v === '' || v === null || v === undefined) return { value: '' };
  if (typeof v === 'number') {
    if (v < 60 || v > 80000) return { value: '', warn: `Date “${v}” not recognised` };
    return { value: new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10) };
  }
  const s = String(v).trim();
  const bad = { value: '', warn: `Date “${s}” not recognised` };
  let y; let m; let d; let mm;
  if ((mm = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(s))) { y = +mm[1]; m = +mm[2]; d = +mm[3]; }
  else if ((mm = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2}|\d{4})$/.exec(s))) {
    const a = +mm[1]; const b = +mm[2];
    if (b > 12 && a <= 12) { m = a; d = b; } else { d = a; m = b; }   // day first unless impossible
    y = +mm[3];
    if (mm[3].length === 2) { const cy = new Date().getFullYear(); y = 2000 + y > cy + (kind === 'contract' ? 15 : 0) ? 1900 + y : 2000 + y; }
  } else if (/^\d+(\.\d+)?$/.test(s)) return parseDate(Number(s), kind);
  else return bad;
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return bad;
  const iso = dt.toISOString().slice(0, 10);
  if (kind === 'birth' && (y < 1940 || iso > todayIso())) return { value: '', warn: `Date of birth “${s}” out of range` };
  return { value: iso };
}
function parseHeight(v) {
  if (v === '' || v === null || v === undefined) return { value: null };
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.').replace(/[^\d.]/g, ''));
  if (!Number.isFinite(n) || n <= 0) return { value: null, warn: `Height “${v}” not recognised` };
  const cm = n < 3 ? Math.round(n * 100) : Math.round(n);
  return cm >= 140 && cm <= 215 ? { value: cm } : { value: null, warn: `Height “${v}” out of range` };
}
const lookup = (map, label) => (v) => {
  const s = asText(v).value;
  if (!s) return { value: '' };
  const id = map[normKey(s)];
  return id ? { value: id } : { value: '', warn: `${label} “${s}” not recognised` };
};

const IMPORT_FIELDS = [
  { id: 'name', label: 'Name', syn: ['nome', 'jogador', 'player', 'player name', 'nome do jogador', 'atleta'], parse: asText },
  { id: 'fullName', label: 'Full name', syn: ['nome completo'], parse: asText },
  { id: 'position', label: 'Position', syn: ['posicao', 'pos', 'posicao principal', 'primary position', 'main position'], parse: lookup(POSITION_ALIASES, 'Position') },
  { id: 'secondaryPositions', label: 'Secondary positions', syn: ['secondary position', 'posicoes secundarias', 'posicao secundaria', 'outras posicoes'],
    parse: (v) => {
      const parts = asText(v).value.split(/[,;/|]+/).map((x) => x.trim()).filter(Boolean);
      const codes = parts.map((x) => POSITION_ALIASES[normKey(x)]).filter(Boolean);
      const unknown = parts.filter((x) => !POSITION_ALIASES[normKey(x)]);
      return { value: [...new Set(codes)], warn: unknown.length ? `Position “${unknown.join(', ')}” not recognised` : '' };
    } },
  { id: 'birthDate', label: 'Date of birth', syn: ['dob', 'birth date', 'birthdate', 'data de nascimento', 'nascimento', 'data nascimento', 'data nasc', 'born'], parse: (v) => parseDate(v, 'birth') },
  { id: 'nationality', label: 'Nationality', syn: ['nacionalidade', 'country', 'pais', 'nation'], parse: (v) => ({ value: fromPortuguese(asText(v).value, COUNTRIES) }) },
  { id: 'secondNationality', label: 'Second nationality', syn: ['segunda nacionalidade', '2a nacionalidade', 'dupla nacionalidade'], parse: (v) => ({ value: fromPortuguese(asText(v).value, COUNTRIES) }) },
  { id: 'heightCm', label: 'Height (cm)', syn: ['height', 'altura', 'altura cm'], parse: parseHeight },
  { id: 'foot', label: 'Foot', syn: ['preferred foot', 'pe', 'pe preferido', 'strong foot'], parse: lookup(FOOT_ALIASES, 'Foot') },
  { id: 'club', label: 'Club', syn: ['clube', 'equipa', 'team', 'current club', 'clube atual'], parse: asText },
  { id: 'competition', label: 'Competition', syn: ['competicao', 'liga', 'league'], parse: asText },
  { id: 'contractEnd', label: 'Contract until', syn: ['contract end', 'contract expires', 'fim de contrato', 'contrato ate', 'contrato', 'fim contrato', 'termo do contrato'], parse: (v) => parseDate(v, 'contract') },
  { id: 'agent', label: 'Agent', syn: ['agente', 'empresario', 'representante'], parse: asText },
  { id: 'marketValue', label: 'Market value', syn: ['valor de mercado', 'valor'], parse: asText },
  { id: 'shirtNumber', label: 'Shirt number', syn: ['shirt', 'number', 'no', 'n', 'numero', 'nº', 'n º', 'camisola', '#'],
    parse: (v) => {
      if (v === '' || v === null || v === undefined) return { value: null };
      const n = Number(String(v).replace(/[^\d]/g, ''));
      return Number.isInteger(n) && n >= 1 && n <= 99 ? { value: n } : { value: null, warn: `Shirt number “${v}” not recognised` };
    } },
  { id: 'squadStatus', label: 'Squad status', syn: ['status', 'estado', 'situacao'], parse: lookup(SQUAD_STATUS_ALIASES, 'Squad status') },
];
IMPORT_FIELDS.forEach((f) => { f.keys = [f.label, inPortuguese(f.label), ...f.syn].map(normKey); });
const IMPORT_FIELD = Object.fromEntries(IMPORT_FIELDS.map((f) => [f.id, f]));

function autoMap(headers) {
  const used = new Set();
  return headers.map((h) => {
    const k = normKey(h);
    const f = k && IMPORT_FIELDS.find((x) => !used.has(x.id) && x.keys.includes(k));
    if (!f) return '';
    used.add(f.id);
    return f.id;
  });
}

/* -- File reading -- */
function decodeText(buf) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(buf); }
  catch (e) { return new TextDecoder('windows-1252').decode(buf); }   // Excel "CSV" saved on Windows
}

function parseDelimited(input) {
  const text = String(input).replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/).find((l) => l.trim()) || '';
  const counts = ['\t', ';', ','].map((d) => [d, firstLine.split(d).length - 1]).sort((a, b) => b[1] - a[1]);
  const delim = counts[0][1] > 0 ? counts[0][0] : ',';
  const rows = [];
  let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else quoted = false; }
      else field += ch;
    } else if (ch === '"' && field === '') quoted = true;
    else if (ch === delim) { row.push(field); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field); rows.push(row); row = []; field = '';
    } else field += ch;
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows;
}

async function unzip(buffer) {
  const u8 = new Uint8Array(buffer);
  const dv = new DataView(buffer);
  let eocd = -1;
  for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
    if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new ImportError('The file could not be read. Check it is a valid .xlsx file.');
  const entries = new Map();
  const dec = new TextDecoder();
  let p = dv.getUint32(eocd + 16, true);
  const count = dv.getUint16(eocd + 10, true);
  for (let i = 0; i < count && dv.getUint32(p, true) === 0x02014b50; i++) {
    const nameLen = dv.getUint16(p + 28, true);
    entries.set(dec.decode(u8.subarray(p + 46, p + 46 + nameLen)), {
      method: dv.getUint16(p + 10, true), size: dv.getUint32(p + 20, true), offset: dv.getUint32(p + 42, true),
    });
    p += 46 + nameLen + dv.getUint16(p + 30, true) + dv.getUint16(p + 32, true);
  }
  return {
    async text(name) {
      const e = entries.get(name);
      if (!e) return null;
      const start = e.offset + 30 + dv.getUint16(e.offset + 26, true) + dv.getUint16(e.offset + 28, true);
      const raw = u8.subarray(start, start + e.size);
      if (e.method === 0) return dec.decode(raw);
      if (e.method !== 8 || typeof DecompressionStream === 'undefined') throw new ImportError('This browser can’t read Excel files. Save the file as .csv and try again.');
      const out = await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer();
      return dec.decode(out);
    },
  };
}

async function readXlsx(buffer) {
  const zip = await unzip(buffer);
  const parse = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const all = (node, tag) => Array.from(node.getElementsByTagNameNS('*', tag));
  const wbText = await zip.text('xl/workbook.xml');
  if (!wbText) throw new ImportError('The file could not be read. Check it is a valid .xlsx file.');
  const firstSheet = all(parse(wbText), 'sheet')[0];
  const ridAttr = firstSheet && Array.from(firstSheet.attributes).find((a) => a.localName === 'id');
  let path = 'xl/worksheets/sheet1.xml';
  const relsText = await zip.text('xl/_rels/workbook.xml.rels');
  if (ridAttr && relsText) {
    const rel = all(parse(relsText), 'Relationship').find((r) => r.getAttribute('Id') === ridAttr.value);
    if (rel) { const t = rel.getAttribute('Target'); path = t.startsWith('/') ? t.slice(1) : `xl/${t.replace(/^\.\//, '')}`; }
  }
  const sstText = await zip.text('xl/sharedStrings.xml');
  const shared = sstText ? all(parse(sstText), 'si').map((si) => all(si, 't')
    .filter((t) => t.parentNode === si || t.parentNode.localName === 'r').map((t) => t.textContent).join('')) : [];
  const sheetText = await zip.text(path);
  if (!sheetText) throw new ImportError('The first sheet of the file is empty.');
  const colIndex = (ref) => {
    const letters = /^[A-Z]+/.exec(ref || '');
    return letters ? letters[0].split('').reduce((n, ch) => n * 26 + ch.charCodeAt(0) - 64, 0) - 1 : -1;
  };
  const rows = [];
  all(parse(sheetText), 'row').forEach((row) => {
    const out = [];
    all(row, 'c').forEach((c) => {
      const idx = colIndex(c.getAttribute('r'));
      const t = c.getAttribute('t');
      const v = all(c, 'v')[0];
      let val = '';
      if (t === 's') val = shared[Number(v && v.textContent)] ?? '';
      else if (t === 'inlineStr') val = all(c, 't').map((x) => x.textContent).join('');
      else if (t === 'b') val = v && v.textContent === '1' ? 'TRUE' : 'FALSE';
      else if (t === 'str' || t === 'e' || t === 'd') val = v ? v.textContent : '';
      else val = v && v.textContent !== '' ? Number(v.textContent) : '';
      out[idx >= 0 ? idx : out.length] = val;
    });
    const r = Number(row.getAttribute('r')) - 1;
    rows[Number.isInteger(r) && r >= 0 ? r : rows.length] = out;
  });
  return Array.from(rows, (r) => Array.from(r || [], (c) => (c === undefined ? '' : c)));
}

/* -- Template (.xlsx written without a library) -- */
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
function crc32(u8) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < u8.length; i++) c = CRC_TABLE[(c ^ u8[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}
function zipStored(files) {
  const enc = new TextEncoder();
  const parts = []; const central = []; let offset = 0;
  files.forEach(({ name, text }) => {
    const n = enc.encode(name); const data = enc.encode(text); const crc = crc32(data);
    const local = new DataView(new ArrayBuffer(30));
    [[0, 0x04034b50, 4], [4, 20, 2], [6, 0x0800, 2], [8, 0, 2], [10, 0, 2], [12, 0x21, 2], [14, crc, 4], [18, data.length, 4], [22, data.length, 4], [26, n.length, 2], [28, 0, 2]]
      .forEach(([o, v, s]) => (s === 4 ? local.setUint32(o, v, true) : local.setUint16(o, v, true)));
    const cen = new DataView(new ArrayBuffer(46));
    [[0, 0x02014b50, 4], [4, 20, 2], [6, 20, 2], [8, 0x0800, 2], [10, 0, 2], [12, 0, 2], [14, 0x21, 2], [16, crc, 4], [20, data.length, 4], [24, data.length, 4], [28, n.length, 2], [42, offset, 4]]
      .forEach(([o, v, s]) => (s === 4 ? cen.setUint32(o, v, true) : cen.setUint16(o, v, true)));
    parts.push(new Uint8Array(local.buffer), n, data);
    central.push(new Uint8Array(cen.buffer), n);
    offset += 30 + n.length + data.length;
  });
  const size = central.reduce((a, c) => a + c.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
  end.setUint32(12, size, true); end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
}

const TEMPLATE_COLUMNS = [
  ['name', 24, 'Yes', 'The name used day to day.'],
  ['fullName', 28, '', 'Full registered name.'],
  ['position', 12, '', 'GK, RB, CB, LB, RWB, LWB, DM, CM, AM, RM, LM, RW, LW or ST. Portuguese names such as "Defesa central" also work.'],
  ['secondaryPositions', 20, '', 'Position codes separated by commas, e.g. CM, AM.'],
  ['birthDate', 15, '', 'A date, e.g. 25/03/2001.'],
  ['nationality', 18, '', 'Country.'],
  ['secondNationality', 18, '', 'Country.'],
  ['heightCm', 12, '', 'Centimetres, e.g. 184.'],
  ['foot', 10, '', 'Right, Left or Both.'],
  ['club', 22, '', 'Current club. Leave empty for players in our squad.'],
  ['competition', 22, '', 'League or competition.'],
  ['contractEnd', 15, '', 'A date, e.g. 30/06/2027.'],
  ['agent', 20, '', 'Agent or agency.'],
  ['marketValue', 14, '', 'Free text, e.g. €2.5M.'],
  ['shirtNumber', 13, '', '1 to 99. Used when importing into the squad.'],
  ['squadStatus', 14, '', 'Available, Doubtful, Injured, Suspended or On loan. Used when importing into the squad.'],
];
function buildTemplate() {
  const x = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const col = (i) => { let s = ''; let n = i + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const cell = (ref, text, style) => `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${x(text)}</t></is></c>`;
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const frozen = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
  const dateCols = new Set(['birthDate', 'contractEnd']);
  const lists = { position: PLAYER_POSITIONS.map((p) => tr(p.id)).join(','), foot: ['Right', 'Left', 'Both'].map((f) => tr(f)).join(','), squadStatus: Object.values(VOCAB.squadStatus).map(([l]) => tr(l)).join(',') };
  const ids = TEMPLATE_COLUMNS.map(([id]) => id);
  const validations = Object.entries(lists).map(([id, list]) => {
    const L = col(ids.indexOf(id));
    return `<dataValidation type="list" allowBlank="1" showErrorMessage="0" sqref="${L}2:${L}1000"><formula1>"${x(list)}"</formula1></dataValidation>`;
  });
  const players = `${head}<worksheet ${NS}>${frozen}<sheetFormatPr defaultRowHeight="15"/><cols>${TEMPLATE_COLUMNS.map(([id, w], i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"${dateCols.has(id) ? ' style="2"' : ''}/>`).join('')}</cols><sheetData><row r="1">${TEMPLATE_COLUMNS.map(([id], i) => cell(`${col(i)}1`, tr(IMPORT_FIELD[id].label), 1)).join('')}</row></sheetData><dataValidations count="${validations.length}">${validations.join('')}</dataValidations></worksheet>`;
  const guideRows = [[tr('Column'), LANG === 'pt' ? 'Obrigatório' : 'Required', tr('What to enter')], ...TEMPLATE_COLUMNS.map(([id, , req, help]) => [tr(IMPORT_FIELD[id].label), tr(req || 'No'), tr(help)])];
  const guide = `${head}<worksheet ${NS}>${frozen}<cols><col min="1" max="1" width="22" customWidth="1"/><col min="2" max="2" width="11" customWidth="1"/><col min="3" max="3" width="90" customWidth="1"/></cols><sheetData>${guideRows.map((r, i) => `<row r="${i + 1}">${r.map((v, j) => cell(`${col(j)}${i + 1}`, v, i === 0 ? 1 : 0)).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const styles = `${head}<styleSheet ${NS}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6ECF7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="14" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  return zipStored([
    { name: '[Content_Types].xml', text: `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>` },
    { name: '_rels/.rels', text: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', text: `${head}<workbook ${NS} xmlns:r="${REL}"><sheets><sheet name="${x(tr('Players'))}" sheetId="1" r:id="rId1"/><sheet name="${x(tr('Guide'))}" sheetId="2" r:id="rId2"/></sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="${REL}/styles" Target="styles.xml"/></Relationships>` },
    { name: 'xl/worksheets/sheet1.xml', text: players },
    { name: 'xl/worksheets/sheet2.xml', text: guide },
    { name: 'xl/styles.xml', text: styles },
  ]);
}

async function downloadTemplate() {
  let dl = null;
  try { dl = (window.claude && typeof window.claude.use === 'function') ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
  if (!dl) { toast('Downloads are not available in this view. The recognised column names are listed below.', 'alert'); return; }
  try {
    await dl.save({ filename: LANG === 'pt' ? 'modelo-importacao-jogadores.xlsx' : 'player-import-template.xlsx', data: buildTemplate() });
  } catch (err) {
    if (err && (err.code === 'declined' || err.code === 'rate_limited')) return;
    toast('The template could not be downloaded here.', 'alert');
  }
}

/* -- Export all: every collection as one sheet each, in one .xlsx -- */
// sheets: [{ name, cols: [[label, width]], rows: [[value…]] }]. Numbers stay numbers; everything else is text.
function buildWorkbook(sheets) {
  const x = (s) => String(s).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c])).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');
  const col = (i) => { let s = ''; let n = i + 1; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
  const cell = (ref, v, style) => {
    if (typeof v === 'number' && Number.isFinite(v)) return `<c r="${ref}"${style ? ` s="${style}"` : ''}><v>${v}</v></c>`;
    const t = v === null || v === undefined ? '' : String(v);
    return t === '' ? '' : `<c r="${ref}" t="inlineStr"${style ? ` s="${style}"` : ''}><is><t xml:space="preserve">${x(t)}</t></is></c>`;
  };
  const NS = 'xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"';
  const head = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>';
  const REL = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const CT = 'application/vnd.openxmlformats-officedocument.spreadsheetml';
  const frozen = '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>';
  const sheetXml = (s) => `${head}<worksheet ${NS}>${frozen}<sheetFormatPr defaultRowHeight="15"/><cols>${s.cols.map(([, w], i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData><row r="1">${s.cols.map(([label], i) => cell(`${col(i)}1`, label, 1)).join('')}</row>${s.rows.map((r, ri) => `<row r="${ri + 2}">${r.map((v, ci) => cell(`${col(ci)}${ri + 2}`, v)).join('')}</row>`).join('')}</sheetData></worksheet>`;
  const styles = `${head}<styleSheet ${NS}><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE6ECF7"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
  const n = sheets.length;
  return zipStored([
    { name: '[Content_Types].xml', text: `${head}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="${CT}.sheet.main+xml"/>${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="${CT}.worksheet+xml"/>`).join('')}<Override PartName="/xl/styles.xml" ContentType="${CT}.styles+xml"/></Types>` },
    { name: '_rels/.rels', text: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="xl/workbook.xml"/></Relationships>` },
    { name: 'xl/workbook.xml', text: `${head}<workbook ${NS} xmlns:r="${REL}"><sheets>${sheets.map((s, i) => `<sheet name="${x(s.name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
    { name: 'xl/_rels/workbook.xml.rels', text: `${head}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="${REL}/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${n + 1}" Type="${REL}/styles" Target="styles.xml"/></Relationships>` },
    ...sheets.map((s, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, text: sheetXml(s) })),
    { name: 'xl/styles.xml', text: styles },
  ]);
}

// Only what the person exporting may see: whole sheets follow their area permissions,
// financial columns follow the financial permissions.
function exportSheets() {
  const name = (id) => { const p = PlayerStore.get(id); return p ? p.name : ''; };
  const day = (iso) => (iso ? String(iso).slice(0, 10) : '');
  const L = (v) => (v ? tr(v) : v);
  const yes = (b) => (b ? L('Yes') : '');
  const label = (list, id) => { const f = list.find((x) => x.id === id); return f ? L(f.label) : (id || ''); };
  const need = (id) => { const n = id ? NeedStore.get(id) : null; return n ? L(needLabel(n)) : ''; };
  const codes = (list) => (list || []).map(L).join(', ');
  const num = (v) => (v === null || v === undefined || v === '' ? '' : Number(v));
  const fin = FINANCE_FIELDS.filter(([, , key]) => canSeeFinance(key));
  const sheets = [];
  if (can('players.view')) {
    sheets.push({ name: 'Players', cols: [['Name', 28], ['Full name', 30], ['Position', 10], ['Secondary positions', 18], ['Date of birth', 13], ['Nationality', 16], ['Second nationality', 16], ['Height (cm)', 11], ['Foot', 8], ['Club', 22], ['Competition', 20], [`In ${SEASON.label} squad`, 14], ['Internal status', 16], ['Review on', 12], ['Not for us', 14], ['Closed on', 12], ['Contract until', 13], ['Current contract', 22], ['Option', 16], ['Agent', 18], ['Loan', 16], ...fin.map(([, l]) => [l, 16]), ['Created', 12], ['Updated', 12]],
      rows: PlayerStore.list().map((p) => { const c = p.contract || {}; const f = financeFor(p.id); return [p.name, p.fullName, L(p.position), codes(p.secondaryPositions), p.birthDate, L(p.nationality), L(p.secondNationality), num(p.heightCm), L(FEET[p.foot] || ''), p.club, p.competition, yes(squadMember(p.id)), label(INTERNAL_STATUS, p.internalStatus || 'untracked'), p.reviewOn, p.closed ? L(CLOSE_REASONS[p.closed.reason] || 'Yes') : '', p.closed ? p.closed.date : '', c.endDate, c.current, c.option, c.agent, c.loan, ...fin.map(([k]) => f[k] || ''), day(p.createdAt), day(p.updatedAt)]; }) });
  }
  if (can('squad.view')) {
    sheets.push({ name: `Squad ${SEASON.id}`, cols: [['Player', 30], ['Position', 10], ['Shirt number', 12], ['Status', 12], ['Added', 12]],
      rows: SquadStore.list().map((m) => { const p = PlayerStore.get(m.playerId); return [p ? p.name : '', p ? L(p.position) : '', num(m.shirtNumber), L(VOCAB.squadStatus[m.status][0]), day(m.addedAt)]; }) });
  }
  if (can('shortlists.view')) {
    sheets.push({ name: 'Needs', cols: [['Need', 26], ['Profile', 30], ['Priority', 10], ['Window', 14], ['Reasons', 30], ['Deal type', 12], ['Age from', 9], ['Age to', 9], ['Related squad player', 26], ['Status', 12], ['Candidates', 11], ['Notes', 34], ['Created', 12]],
      rows: NeedStore.list().map((n) => [L(needLabel(n)), n.profile, L(VOCAB.priority[n.priority]), label(NEED_WINDOWS, n.window), (n.reasons || []).map((r) => label(NEED_REASONS, r)).join(', '), L(DEAL_TYPES[n.dealType] || ''), num(n.ageMin), num(n.ageMax), name(n.relatedPlayerId), VOCAB.needStatus[n.status] ? L(VOCAB.needStatus[n.status][0]) : n.status, n.candidates.length, n.notes, day(n.createdAt)]) });
    sheets.push({ name: 'Shortlists', cols: [['Need', 26], ['Order', 7], ['Player', 30], ['Position', 10], ['Club', 22], ['Added', 12]],
      rows: NeedStore.list().flatMap((n) => n.candidates.map((c, i) => { const p = PlayerStore.get(c.playerId); return [L(needLabel(n)), i + 1, p ? p.name : '', p ? L(p.position) : '', p ? clubOf(p) : '', day(c.addedAt)]; })) });
  }
  if (canAny('reports.viewOwn', 'reports.viewTeam')) {
    sheets.push({ name: 'Reports', cols: [['Date', 12], ['Player', 28], ['Type', 8], ['Seen', 8], ['Match', 26], ['Competition', 18], ['Position played', 10], ['Minutes', 9], ['Current level', 12], ['Potential', 10], ...DIMENSIONS.map((d) => [d.label, 10]), ['Attributes', 50], ['Recommendation', 16], ['Reason', 14], ['Summary', 50], ['Strengths', 40], ['Concerns', 40], ['Need', 24], ['Author', 20]],
      rows: visibleReports().map((r) => [r.date, name(r.playerId), L(r.type === 'full' ? 'Full' : 'Quick'), L(VENUES[r.venue] || ''), r.match, r.competition, L(r.positionPlayed), num(r.minutes), num(r.levelNow), num(r.levelPotential), ...DIMENSIONS.map((d) => num(r.dimensions[d.id])), r.attributes.map((a) => `${L(a.name)} ${a.score}`).join('; '), RECOMMENDATION[r.recommendation] ? L(RECOMMENDATION[r.recommendation].label) : '', L(CLOSE_REASONS[r.closeReason] || ''), r.summary, r.strengths.join('; '), r.concerns.join('; '), need(r.needId), L(authorName(r.authorId, r.scout))]) });
  }
  if (canAny('assignments.viewOwn', 'assignments.viewAll')) {
    sheets.push({ name: 'Assignments', cols: [['Watch by', 12], ['Player', 28], ['Match', 26], ['Need', 24], ['Status', 10], ['Note', 40], ['Assigned to', 20]],
      rows: visibleRequests().map((q) => [q.dueBy, name(q.playerId), q.match, need(q.needId), VOCAB.requestStatus[q.status] ? tr(VOCAB.requestStatus[q.status][0], 'status') : q.status, q.note, L(authorName(q.assigneeId, q.scout))]) });
  }
  if (can('notes.view')) {
    sheets.push({ name: 'Notes', cols: [['Date', 17], ['Player', 28], ['Category', 12], ['Note', 80], ['Author', 20]],
      rows: NoteStore.list().map((n) => [noteStamp(n), name(n.playerId), L(noteCategoryLabel(n.category)), n.text, n.imported ? L('Imported') : L(authorName(n.authorId, n.author))]) });
  }
  if (can('shadow.view')) {
    sheets.push({ name: 'Shadow Teams', cols: [['Team', 24], ['Formation', 10], ['Position', 10], ['Order', 7], ['Priority', 18], ['Player', 28], ['Note', 30]],
      rows: ShadowTeamStore.list().flatMap((t) => {
        const seen = {};
        return t.entries.map((e) => { seen[e.positionId] = (seen[e.positionId] || 0) + 1; const i = seen[e.positionId] - 1; return [t.name, t.formation, L(e.positionId), i + 1, L(tierLabel(i)), name(e.playerId), e.note]; });
      }) });
  }
  if (can('criteria.view')) {
    sheets.push({ name: 'Evaluation criteria', cols: [['Position group', 26], ['Positions', 18], ['Attributes', 80]],
      rows: (() => { const lists = evaluationAttributes(); return ATTRIBUTE_GROUPS.map((g) => [L(g.label), codes(g.positions), lists[g.id].map(L).join('; ')]); })() });
  }
  sheets.forEach((s) => { s.name = L(s.name); s.cols = s.cols.map(([l, w]) => [L(l), w]); });
  return sheets;
}

async function exportAll() {
  const busy = STORES.some((s) => s.status() === 'connecting');
  if (busy) { toast('Still loading the data. Try again in a moment.', 'info'); return; }
  let dl = null;
  try { dl = (window.claude && typeof window.claude.use === 'function') ? await window.claude.use('downloads') : null; } catch (e) { dl = null; }
  if (!dl) { toast('Downloads are not available in this view.', 'alert'); return; }
  const stamp = todayIso();
  try {
    const sheets = exportSheets();
    if (!sheets.length) { toast('There is nothing you can export.', 'info'); return; }
    await dl.save({ filename: `leixoes-scouting-export-${stamp}.xlsx`, data: buildWorkbook(sheets) });
    toast('Export ready', 'check');
  } catch (err) {
    if (err && (err.code === 'declined' || err.code === 'rate_limited')) return;
    toast('The export could not be downloaded here.', 'alert');
  }
}

/* -- Import plan and dialog -- */
let imp = null;
const FIN_SKIPPED = 'Market value is financial information you cannot edit; it is not imported';

function buildPlan() {
  const byName = new Map();
  PlayerStore.list().forEach((p) => { const k = normKey(p.name); byName.set(k, [...(byName.get(k) || []), p]); });
  const seen = new Set();
  const shirts = new Set(SquadStore.list().map((m) => m.shirtNumber).filter((x) => x !== null));
  const checkShirtUse = (r) => {
    if (!imp.toSquad || r.shirtNumber === null || !['ready', 'link'].includes(r.status)) return r;
    if (shirts.has(r.shirtNumber)) r.warnings.push(`Shirt number ${r.shirtNumber} is already taken; it will be left empty`);
    else shirts.add(r.shirtNumber);
    return r;
  };
  return imp.rows.map((cells, i) => checkShirtUse((() => {
    const r = { line: i + 2, player: {}, warnings: [], shirtNumber: null, squadStatus: '' };
    const contract = {};
    imp.mapping.forEach((fid, c) => {
      if (!fid) return;
      const res = IMPORT_FIELD[fid].parse(cells[c]);
      if (res.warn) r.warnings.push(res.warn);
      const v = res.value;
      if (!has(v)) return;
      if (fid === 'contractEnd') contract.endDate = v;
      else if (fid === 'agent') contract.agent = v;
      // Market value goes to the protected financial record, and only for people who may edit it.
      else if (fid === 'marketValue') { if (can('financial.edit') && FinanceStore.started()) r.finance = { marketValue: v }; else if (!r.warnings.includes(FIN_SKIPPED)) r.warnings.push(FIN_SKIPPED); }
      else if (fid === 'shirtNumber') r.shirtNumber = v;
      else if (fid === 'squadStatus') r.squadStatus = v;
      else r.player[fid] = v;
    });
    if (Object.keys(contract).length) r.player.contract = contract;
    if (r.player.secondaryPositions) r.player.secondaryPositions = r.player.secondaryPositions.filter((x) => x !== r.player.position);
    if (!r.player.name) { r.status = 'missing'; return r; }
    const key = `${normKey(r.player.name)}|${r.player.birthDate || ''}`;
    if (seen.has(key)) { r.status = 'repeat'; return r; }
    seen.add(key);
    const match = (byName.get(normKey(r.player.name)) || []).find((p) => !p.birthDate || !r.player.birthDate || p.birthDate === r.player.birthDate);
    if (match) {
      r.existingId = match.id;
      r.status = imp.toSquad ? (squadMember(match.id) ? 'member' : 'link') : 'duplicate';
    } else r.status = 'ready';
    return r;
  })()));
}

function openImport(toSquad) {
  imp = { step: 'source', toSquad: !!toSquad, rows: [], headers: [], mapping: [], fileName: '', error: '', busy: false, done: 0, total: 0, pasteOpen: false };
  renderImport();
}

function renderImport() {
  const html = imp.step === 'source' ? importSourceHtml() : importReviewHtml();
  if (dlg.open && dlg.dataset.view === 'import') {
    const activeId = document.activeElement && document.activeElement.id;
    const scroller = $('.dlg-scroll', dlg);
    const top = scroller ? scroller.scrollTop : 0;
    dlg.innerHTML = html;
    const s2 = $('.dlg-scroll', dlg);
    if (s2) s2.scrollTop = top;
    const el = activeId && document.getElementById(activeId);
    if (el && dlg.contains(el)) el.focus({ preventScroll: true });
  } else {
    openDialog(html, { wide: true });
    dlg.dataset.view = 'import';
  }
}

function squadCheckbox() {
  return `<label class="check" for="imp-squad"><input type="checkbox" id="imp-squad" data-change="imp-squad"${imp.toSquad ? ' checked' : ''}${imp.busy ? ' disabled' : ''}>Add these players to the ${esc(SEASON.label)} squad</label>`;
}

function importSourceHtml() {
  const recognised = IMPORT_FIELDS.map((f) => f.label).join(', ');
  return `<div class="dlg-body">
    <h2 class="dlg-title" id="dlg-title">Import players</h2>
    <div class="imp-template">
      <div><div class="cell-strong">Start from the template</div><div class="cell-sub">One player per row. Only Name is required.</div></div>
      ${UI.btn({ label: 'Download template', iconName: 'download', action: 'imp-template' })}
    </div>
    <label class="dropzone" for="imp-file" data-dropzone>
      <input type="file" id="imp-file" class="sr-only" accept=".xlsx,.csv,.txt,text/csv" data-change="imp-file">
      ${icon('upload')}
      <span class="cell-strong">Choose an Excel or CSV file</span>
      <span class="cell-sub">or drop it here · .xlsx or .csv</span>
    </label>
    ${imp.error ? `<p class="field-error" role="alert">${esc(imp.error)}</p>` : ''}
    <div>
      <details class="acc acc--flat"${imp.pasteOpen ? ' open' : ''}>
        <summary>${icon('note')}<span>Paste rows from a spreadsheet</span>${icon('chevron', 'chev')}</summary>
        <div class="acc__body">
          <label class="sr-only" for="imp-paste">Rows to import</label>
          <textarea id="imp-paste" class="textarea" rows="5" placeholder="Copy the rows in Excel or Google Sheets, header row included, and paste them here"></textarea>
          <div style="margin-top:8px">${UI.btn({ label: 'Use pasted rows', action: 'imp-paste' })}</div>
        </div>
      </details>
      <details class="acc acc--flat">
        <summary>${icon('list')}<span>Recognised columns</span>${icon('chevron', 'chev')}</summary>
        <div class="acc__body"><p class="dlg-text small">${esc(recognised)}. Portuguese names such as Nome, Posição, Data de nascimento, Clube or Número also work.</p></div>
      </details>
    </div>
    ${squadCheckbox()}
    <div class="dlg-actions"><button type="button" class="btn btn--ghost" data-action="close-dialog">Cancel</button></div>
  </div>`;
}

const IMPORT_STATUS = {
  ready:     () => UI.status('Ready', 'positive'),
  link:      () => UI.status('Joins squad', 'accent'),
  duplicate: () => UI.status('Already added', 'neutral'),
  member:    () => UI.status('Already in squad', 'neutral'),
  repeat:    () => UI.status('Repeated row', 'neutral'),
  missing:   () => UI.status('No name', 'danger'),
};

function importReviewHtml() {
  const plan = buildPlan();
  const n = (s) => plan.filter((r) => r.status === s).length;
  const todo = n('ready') + n('link');
  const hasName = imp.mapping.includes('name');
  const summary = [[n('ready'), 'new'], [n('link'), 'existing, joining the squad'], [n('duplicate'), 'already in the database'], [n('member'), 'already in the squad'], [n('repeat'), 'repeated rows'], [n('missing'), 'without a name']]
    .filter(([c]) => c).map(([c, l]) => `<span><b>${c}</b>${esc(l)}</span>`).join('');
  const toCheck = plan.filter((r) => r.warnings.length && (r.status === 'ready' || r.status === 'link')).length;

  const mapping = imp.headers.map((h, i) => `<div class="map-row">
      <span class="map-src" title="${esc(h)}">${esc(h || `Column ${i + 1}`)}</span>${icon('arrow')}
      ${UI.select({ id: `imp-map-${i}`, change: 'imp-map', value: imp.mapping[i], ariaLabel: `Field for ${h || `column ${i + 1}`}`, options: [{ value: '', label: 'Ignore' }, ...IMPORT_FIELDS.map((f) => ({ value: f.id, label: f.label }))] })}
    </div>`).join('');

  const shown = plan.slice(0, 50);
  const cell = (v) => (has(v) ? esc(v) : `<span class="faint">${EMPTY}</span>`);
  const rows = shown.map((r) => {
    const p = r.player;
    const warn = r.warnings.length && (r.status === 'ready' || r.status === 'link') ? `<span class="imp-warn">${esc(r.warnings.join(' · '))}</span>` : '';
    return `<tr>
      <td class="num faint">${r.line}</td>
      <td class="wrap-cell">${p.name ? `<span class="cell-strong">${esc(p.name)}</span>` : `<span class="faint">${EMPTY}</span>`}${warn}</td>
      <td>${p.position ? `<span class="pos">${esc(p.position)}</span>` : `<span class="faint">${EMPTY}</span>`}</td>
      <td>${cell(fmtDate(p.birthDate))}</td>
      <td>${cell(p.nationality)}</td>
      <td>${cell(p.club)}</td>
      ${imp.toSquad ? `<td class="num">${cell(r.shirtNumber)}</td>` : ''}
      <td>${IMPORT_STATUS[r.status]()}</td>
    </tr>`;
  }).join('');
  const table = `<div class="table-wrap imp-preview"><table class="table"><caption class="sr-only">Rows to import</caption>
    <thead><tr><th scope="col">Row</th><th scope="col">Name</th><th scope="col">Pos</th><th scope="col">Date of birth</th><th scope="col">Nationality</th><th scope="col">Club</th>${imp.toSquad ? '<th scope="col">#</th>' : ''}<th scope="col">Result</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;

  const runLabel = imp.busy ? `Importing ${imp.done} of ${imp.total}…` : `Import ${todo} player${todo === 1 ? '' : 's'}`;
  return `<div class="dlg-body">
    <div>
      <h2 class="dlg-title" id="dlg-title">Import players</h2>
      <p class="dlg-text">${esc(imp.fileName)} · ${imp.rows.length} row${imp.rows.length === 1 ? '' : 's'}${imp.truncated ? ` (first ${IMPORT_MAX_ROWS} only)` : ''}</p>
    </div>
    <div class="dlg-scroll">
      <div class="form-section">
        ${UI.sectionTitle('Columns')}
        <div class="map-grid">${mapping}</div>
        ${hasName ? '' : '<p class="field-error">Choose the column that holds the player’s name.</p>'}
      </div>
      <div class="form-section">
        ${UI.sectionTitle('Preview', toCheck ? `<span class="save-state">${icon('alert')}${toCheck} row${toCheck === 1 ? '' : 's'} with values to check</span>` : '')}
        <div class="stat-row">${summary}</div>
        ${table}
        ${plan.length > shown.length ? `<p class="small faint">Showing the first ${shown.length} of ${plan.length} rows.</p>` : ''}
      </div>
    </div>
    ${squadCheckbox()}
    <div class="dlg-actions dlg-actions--split">
      <div>${UI.btn({ label: 'Choose another file', variant: 'ghost', iconName: 'back', action: 'imp-back', disabled: imp.busy })}</div>
      <div class="dlg-actions__group">
        <button type="button" class="btn btn--ghost" data-action="close-dialog"${imp.busy ? ' disabled' : ''}>Cancel</button>
        <button type="button" class="btn btn--primary" id="imp-run" data-action="imp-run"${!todo || !hasName || imp.busy ? ' disabled' : ''}>${esc(runLabel)}</button>
      </div>
    </div>
  </div>`;
}

async function importFile(file) {
  const ext = (file.name.split('.').pop() || '').toLowerCase();
  imp.error = '';
  try {
    let rows;
    if (ext === 'xlsx') rows = await readXlsx(await file.arrayBuffer());
    else if (ext === 'csv' || ext === 'txt' || file.type === 'text/csv') rows = parseDelimited(decodeText(await file.arrayBuffer()));
    else if (['xls', 'ods', 'numbers'].includes(ext)) throw new ImportError('This format can’t be read here. Save the file as .xlsx or .csv and try again.');
    else throw new ImportError('Choose an .xlsx or .csv file.');
    loadRows(rows, file.name);
  } catch (err) {
    imp.error = err instanceof ImportError ? err.message : 'The file could not be read. Check it is a valid .xlsx or .csv file.';
    renderImport();
  }
}

function loadRows(rows, name) {
  const blank = (c) => c === '' || c === null || c === undefined;
  const clean = rows.map((r) => (r || []).map((c) => (typeof c === 'string' ? c.trim() : c))).filter((r) => r.some((c) => !blank(c)));
  if (clean.length < 2) {
    imp.error = 'No player rows found. The first row must hold the column names, with one player per row below it.';
    renderImport();
    return;
  }
  const width = Math.max(...clean.map((r) => r.length));
  imp.headers = Array.from({ length: width }, (_, i) => String(clean[0][i] ?? '').trim());
  imp.rows = clean.slice(1, IMPORT_MAX_ROWS + 1).map((r) => Array.from({ length: width }, (_, i) => (blank(r[i]) ? '' : r[i])));
  imp.truncated = clean.length - 1 > IMPORT_MAX_ROWS;
  imp.mapping = autoMap(imp.headers);
  imp.fileName = name;
  imp.error = '';
  imp.step = 'review';
  renderImport();
}

async function withRetry(fn) {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); }
    catch (err) {
      const code = err && err.code;
      if (attempt < 4 && (code === 'resource_exhausted' || code === 'unavailable')) {
        await new Promise((r) => setTimeout(r, 800 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

async function runImport() {
  if (!imp || imp.busy) return;
  const plan = buildPlan().filter((r) => r.status === 'ready' || r.status === 'link');
  if (!plan.length) return;
  imp.busy = true; imp.done = 0; imp.total = plan.length;
  renderImport();
  const used = new Set(SquadStore.list().map((m) => m.shirtNumber).filter((x) => x !== null));
  let created = 0; let joined = 0; let failed = false;
  for (const r of plan) {
    try {
      let id = r.existingId;
      if (r.status === 'ready') {
        id = await withRetry(() => PlayerStore.create({ internalStatus: 'untracked', ...r.player }));
        if (r.finance) await withRetry(() => FinanceStore.set(id, { ...Object.fromEntries(FINANCE_FIELDS.map(([k]) => [k, ''])), ...r.finance }));
        created++;
      }
      if (imp.toSquad && !squadMember(id)) {
        let shirt = r.shirtNumber;
        if (shirt !== null && used.has(shirt)) shirt = null;   // keep numbers unique
        if (shirt !== null) used.add(shirt);
        await withRetry(() => SquadStore.set(id, { playerId: id, shirtNumber: shirt, status: r.squadStatus || 'available', addedAt: new Date().toISOString() }));
        joined++;
      }
    } catch (err) { failed = true; break; }
    imp.done++;
    const btn = document.getElementById('imp-run');
    if (btn) btn.textContent = `Importing ${imp.done} of ${imp.total}…`;
  }
  const { toSquad, done, total } = imp;
  imp.busy = false;
  closeDialog();
  navigate(toSquad ? 'squad-first-team' : 'players-database');
  if (failed) toast(`Imported ${done} of ${total}. The rest could not be saved.`, 'alert');
  else toast(`${created} player${created === 1 ? '' : 's'} imported${toSquad ? ` · ${joined} added to the squad` : ''}`, 'check');
}

/* ---- Action handlers (data-action) ---- */
const ACTIONS = {
  'noop': () => {},
  'open-drawer': () => setDrawer(true),
  'set-lang': (el) => setLanguage(el.dataset.lang),
  'set-theme': (el) => setTheme(el.dataset.themeId),
  'sign-out': () => { if (window.ScoutingAuth) window.ScoutingAuth.signOut(); },
  'close-dialog': () => closeDialog(),
  'toggle-menu': (el) => {
    const menu = document.getElementById(el.getAttribute('aria-controls'));
    if (!menu) return;
    const open = menu.hidden;
    closeMenus(menu);
    menu.hidden = !open;
    el.setAttribute('aria-expanded', String(open));
    const float = open && !!el.closest('.table-wrap');
    if (float) floatMenu(menu, el);
    if (open) { const first = menu.querySelector('.menu-item'); if (first) first.focus(float ? { preventScroll: true } : undefined); }
  },
  'profile-tab': (el) => { state.profileTab = el.dataset.id; refresh(); },
  'perf-group': (el) => { state.perfGroup = el.dataset.id; refresh(); },
  'ds-tab': (el) => { state.dsTab = el.dataset.id; refresh(); },
  'player-action': (el) => {
    if (el.dataset.id === 'scout') { openReportDialog(currentPlayer(), { type: 'quick' }); return; }
    if (el.dataset.id === 'shortlist') { openLinkNeedDialog(currentPlayer()); return; }
    const a = PLAYER_ACTIONS.primary.find((x) => x.id === el.dataset.id);
    if (a) toast(`${a.label} arrives with the ${a.module} module.`);
  },
  'report-new': (el) => openReportDialog(currentPlayer(), { type: el.dataset.type }),
  'report-for': (el) => openReportDialog(PlayerStore.get(el.dataset.player), { type: 'full', prefill: { needId: el.dataset.need || '' } }),
  'report-edit': (el) => { const r = ReportStore.get(el.dataset.id); if (r) openReportDialog(PlayerStore.get(r.playerId), { report: r }); },
  'report-delete': (el) => openDeleteReportDialog(el.dataset.id),
  'report-view': (el) => openReportView(el.dataset.id),
  'report-pick': () => openPlayerPicker('report'),
  'pick-new-player': () => openPickNewPlayer(),
  'pick-back': () => openPlayerPicker(state.pick ? state.pick.next : 'report', state.pick ? state.pick.q : ''),
  'request-pick': () => openRequestDialog(null),
  'rq-player-choose': (el) => { const form = el.closest('form'); const p = PlayerStore.get(el.dataset.player); if (form && p) rqSetPlayer(form, p); },
  'rq-player-new': (el) => { const form = el.closest('form'); const q = form && form.elements.namedItem('rq_player_q'); if (q && q.value.trim()) rqSetPlayer(form, null, q.value.trim().slice(0, 80)); },
  'rq-player-change': (el) => { const form = el.closest('form'); if (form) rqSetPlayer(form, null); },
  'pick-player': (el) => {
    const p = PlayerStore.get(el.dataset.player);
    if (state.pick.next === 'request') openRequestDialog(p); else openReportDialog(p);
  },
  'requests-scope': (el) => { state.requests.scope = el.dataset.id; refresh(); },
  'request-report': (el) => {
    const q = RequestStore.get(el.dataset.id);
    if (q) openReportDialog(PlayerStore.get(q.playerId), { prefill: { scout: q.scout, match: q.match, needId: q.needId }, requestId: q.id });
  },
  'request-edit': (el) => { const q = RequestStore.get(el.dataset.id); if (q) openRequestDialog(PlayerStore.get(q.playerId), q); },
  'request-status': (el) => {
    const st = el.dataset.status;
    RequestStore.update(el.dataset.id, { status: st })
      .then(() => toast(`Request ${VOCAB.requestStatus[st][0].toLowerCase()}`, 'check'))
      .catch(() => toast(SAVE_ERROR, 'alert'));
  },
  'request-delete': (el) => {
    RequestStore.remove(el.dataset.id).then(() => toast('Request deleted', 'check')).catch(() => toast(SAVE_ERROR, 'alert'));
  },
  'player-reopen': () => {
    const p = currentPlayer();
    if (p) PlayerStore.update(p.id, { closed: null }).then(() => toast(`${p.name} reopened`, 'check')).catch(() => toast(SAVE_ERROR, 'alert'));
  },
  'crit-add': (el) => {
    const list = document.getElementById(`crit-${el.dataset.group}`);
    if (!list) return;
    if (list.children.length >= MAX_ATTRIBUTES) { toast(`Up to ${MAX_ATTRIBUTES} attributes per position group.`); return; }
    critCounter += 1;
    list.insertAdjacentHTML('beforeend', critRow(el.dataset.group, `n${critCounter}`, ''));
    const input = list.lastElementChild.querySelector('input');
    if (input) input.focus();
  },
  'crit-remove': (el) => { const row = el.closest('.crit-row'); if (row) row.remove(); },
  'crit-reset': () => {
    ATTRIBUTE_GROUPS.forEach((g) => {
      const list = document.getElementById(`crit-${g.id}`);
      if (list) list.innerHTML = DEFAULT_ATTRIBUTES[g.id].map((a, i) => critRow(g.id, `d${i}`, a)).join('');
    });
    toast('Defaults restored in the form. Save to apply them.');
  },
  'open-add-shadow': () => openAddToShadow(),
  'open-player': (el) => openPlayer(el.dataset.id),
  'player-new': () => openNewPlayerDialog(),
  'player-edit': (el) => openEditPlayerDialog(currentPlayer(), el.dataset.section),
  'pos-edit': () => openPositionsDialog(currentPlayer()),
  'user-invite': () => openInviteDialog(),
  'invite-step': (el) => {
    if (!invite) return;
    const form = el.closest('form');
    if (form && invite.step === 3) invite.perms = editorSet(form);
    invite.step = Number(el.dataset.to) || 1;
    renderInviteDialog();
  },
  'invite-copy': async (el) => {
    const inv = InviteStore.get(el.dataset.id);
    const text = inv ? inviteMessage(inv.email, inv.role) : (invite && invite.email ? inviteMessage(invite.email, invite.role) : '');
    if (!text) return;
    const ok = await copyText(text);
    toast(ok ? 'Message copied' : 'Copy did not work here. Select the text and copy it.', ok ? 'check' : 'alert');
  },
  'invite-revoke': async (el) => {
    try { await InviteStore.remove(el.dataset.id); toast('Invitation revoked', 'check'); } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'member-open': (el) => openMemberDialog(el.dataset.id),
  'member-remove': (el) => openRemoveMemberDialog(el.dataset.id),
  'perm-reset': (el) => {
    const form = el.closest('form');
    const role = form && form.elements.namedItem('role') ? form.elements.namedItem('role').value : '';
    if (!form || !role) return;
    const defaults = roleDefaults(role);
    $$('input[name="perm"]', form).forEach((i) => { if (!i.disabled) i.checked = defaults.has(i.value); });
    refreshEditorSummary(form);
  },
  'request-activate': (el) => openActivateDialog(el.dataset.id),
  'request-decline': async (el) => {
    try { await JoinRequestStore.remove(el.dataset.id); toast('Request declined', 'check'); } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },

  'export-all': () => { setDrawer(false); exportAll(); },
  'access-request': async () => {
    if (!Viewer.id) return;
    try {
      await JoinRequestStore.set(Viewer.id, { email: Viewer.email || '', requestedAt: new Date().toISOString() });
      applyMembership();
      refresh();
    } catch (err) { toast('Could not send the request. Try again in a moment.', 'alert'); }
  },
  'note-edit': (el) => openNoteDialog(NoteStore.get(el.dataset.id)),
  'note-delete': (el) => openDeleteNoteDialog(NoteStore.get(el.dataset.id)),
  'player-delete': () => openDeletePlayerDialog(currentPlayer()),
  'squad-new': () => openSquadNewDialog(),
  'squad-add-existing': () => openSquadMemberDialog(currentPlayer()),
  'squad-edit': (el) => openSquadMemberDialog(PlayerStore.get(el.dataset.id)),
  'squad-remove': (el) => {
    closeDialog();
    SquadStore.remove(el.dataset.id)
      .then(() => toast('Removed from the squad', 'check'))
      .catch(() => toast(SAVE_ERROR, 'alert'));
  },
  'need-new': (el) => openNeedDialog(null, el.dataset.pos || ''),
  'need-goto': (el) => {
    state.needs.selected = el.dataset.id;
    navigate('squad-needs');
    $('#content').scrollTop = 0;
  },
  'need-back': () => { state.needs.selected = null; refresh(); },
  'needs-scope': (el) => { state.needs.scope = el.dataset.id; refresh(); },
  'need-edit': () => openNeedDialog(NeedStore.get(state.needs.selected)),
  'need-delete': () => openDeleteNeedDialog(NeedStore.get(state.needs.selected)),
  'need-status': (el) => {
    const s = el.dataset.status;
    NeedStore.update(state.needs.selected, { status: s })
      .then(() => toast(`Need marked as ${VOCAB.needStatus[s][0].toLowerCase()}`, 'check'))
      .catch(() => toast(SAVE_ERROR, 'alert'));
  },
  'need-add-candidate': () => openCandidatePicker(NeedStore.get(state.needs.selected)),
  'need-pick': async (el) => {
    const id = state.needs.selected;
    const p = PlayerStore.get(el.dataset.player);
    try {
      if (await addCandidate(id, el.dataset.player)) toast(`${p ? p.name : 'Player'} added as a candidate`, 'check');
    } catch (err) { toast(SAVE_ERROR, 'alert'); return; }
    const host = $('#pick-results');
    const need = NeedStore.get(id);
    if (host && need) host.innerHTML = pickerResults(need);
  },
  'need-remove-candidate': (el) => {
    const need = NeedStore.get(state.needs.selected);
    if (!need) return;
    NeedStore.update(need.id, { candidates: need.candidates.filter((c) => c.playerId !== el.dataset.player) })
      .then(() => toast('Candidate removed', 'check'))
      .catch(() => toast(SAVE_ERROR, 'alert'));
  },
  'link-need': () => openLinkNeedDialog(currentPlayer()),
  'import-open': (el) => openImport(el.dataset.squad === '1'),
  'imp-template': () => downloadTemplate(),
  'imp-paste': () => {
    const t = $('#imp-paste');
    imp.pasteOpen = true;
    if (!t || !t.value.trim()) { imp.error = 'Paste the rows first, header row included.'; renderImport(); return; }
    loadRows(parseDelimited(t.value), 'Pasted rows');
  },
  'imp-back': () => { imp.step = 'source'; imp.error = ''; renderImport(); },
  'imp-run': () => runImport(),
  'db-scope': (el) => { state.db.scope = el.dataset.id; refresh(); },
  'db-clear': () => { state.db = { q: '', pos: '', scope: 'all', status: '' }; refresh(); },
  'st-new': () => openTeamDialog(),
  'st-rename': () => openTeamDialog(currentTeam()),
  'st-delete': () => openDeleteDialog(currentTeam()),
  'st-pos': (el) => { state.shadow.pos = el.dataset.pos || null; refresh(); },
  'st-up': (el) => shadowMove(el.dataset.player, el.dataset.pos, el.dataset.pos, Number(el.dataset.index) - 1),
  'st-down': (el) => shadowMove(el.dataset.player, el.dataset.pos, el.dataset.pos, Number(el.dataset.index) + 2),
  'st-move-to': (el) => openMoveDialog(el.dataset.player, el.dataset.pos),
  'st-remove': (el) => {
    const team = currentTeam();
    if (team) writeEntries(team, ShadowOps.remove(team, el.dataset.player, el.dataset.pos), 'Removed from list');
  },
};

/* ---- Change handlers (data-change) ---- */
const CHANGES = {
  'st-team': (el) => { state.shadow.teamId = el.value; state.shadow.pos = null; refresh(); },
  'st-formation': (el) => {
    const team = currentTeam();
    if (!team || !FORMATIONS[el.value]) return;
    ShadowTeamStore.update(team.id, { formation: el.value })
      .catch(() => toast('Could not save the change. Your access may be view-only.', 'alert'));
  },
  'add-team': (el) => {
    const team = ShadowTeamStore.get(el.value);
    const sel = $('#add-pos');
    const p = currentPlayer();
    if (!team || !sel) return;
    const pick = slotFor(team.formation, p && p.position);
    sel.innerHTML = positionOptions(team).map((o) => `<option value="${esc(o.value)}"${o.value === pick ? ' selected' : ''}>${esc(o.label)}</option>`).join('');
  },
  'db-pos': (el) => { state.db.pos = el.value; updateDbResults(); },
  'db-status': (el) => { state.db.status = el.value; updateDbResults(); },
  'rp-type': (el) => { const c = el.querySelector('input:checked'); if (c) setReportType(el.closest('form'), c.value); },
  // Ticking an action also ticks what it needs; unticking removes what depends on it.
  'perm-toggle': (el) => {
    const form = el.closest('form');
    const box = el.matches('input') ? el : el.querySelector('input');
    if (!form || !box) return;
    const byKey = Object.fromEntries($$('input[name="perm"]', form).map((i) => [i.value, i]));
    const visit = (key, on, seen = new Set()) => {
      if (seen.has(key)) return;
      seen.add(key);
      const input = byKey[key];
      if (!input || input.disabled) return;
      input.checked = on;
      if (on) PERMISSION[key].requires.forEach((r) => visit(r, true, seen));
      else ALL_PERMISSIONS.filter((k) => PERMISSION[k].requires.includes(key)).forEach((k) => visit(k, false, seen));
    };
    visit(box.value, box.checked);
    refreshEditorSummary(form);
  },
  'member-role': (el) => {
    const form = el.closest('form');
    if (!form) return;
    const holder = form.querySelector('.dlg-scroll--perm');
    if (holder) holder.innerHTML = permissionEditor(roleDefaults(el.value), el.value, { editable: can('users.editPermissions') });
  },
  'pos-pick': (el) => {
    const form = el.closest('form');
    const picked = form.querySelector('input[name="position"]:checked');
    const primary = picked ? picked.value : '';
    $$('input[name="secondary"]', form).forEach((i) => { const same = i.value === primary; if (same) i.checked = false; i.disabled = same; });
    const secondary = $$('input[name="secondary"]:checked', form).map((i) => i.value);
    const out = document.getElementById('pos-summary');
    if (out) { out.textContent = positionSummary(primary, secondary); out.classList.remove('field-error'); }
  },
  'rp-need': (el) => {
    const form = el.closest('form');
    const linked = !!el.value;
    const quick = form.querySelector('input[name="type"][value="quick"]');
    if (linked) { form.querySelector('input[name="type"][value="full"]').checked = true; setReportType(form, 'full'); }
    if (quick) quick.disabled = linked;
    const hint = form.querySelector('#rp-need-hint');
    if (hint) hint.hidden = !linked;
  },
  'rq-assignee': (el) => {
    const field = $('#rq-scout-field');
    if (!field) return;
    field.hidden = el.value !== OTHER_SCOUT;
    if (!field.hidden) $('#f-rq_scout').focus();
  },
  'rp-pos': (el) => {
    const form = el.closest('form');
    const radio = (n) => { const r = form.querySelector(`input[name="${n}"]:checked`); return r ? r.value : ''; };
    const existing = $$('[data-attr-name]', form).map((row, i) => ({ name: row.dataset.attrName, score: numOrNull(radio(`attr_${i}`)) }));
    const host = form.querySelector('#rp-attrs');
    if (host) host.innerHTML = attributeRows(el.value, existing);
  },
  'rp-rec': (el) => { const box = el.closest('form').querySelector('#rp-close'); if (box) box.hidden = el.value !== 'no'; },
  'rep-type': (el) => { state.reports.type = el.value; updateReportResults(); },
  'rep-rec': (el) => { state.reports.rec = el.value; updateReportResults(); },
  'imp-file': (el) => { const f = el.files && el.files[0]; if (f && imp) importFile(f); },
  'imp-squad': (el) => { if (!imp) return; imp.toSquad = el.checked; if (imp.step === 'review') renderImport(); },
  'imp-map': (el) => {
    if (!imp) return;
    const i = Number(el.id.split('-').pop());
    const v = el.value;
    if (v) imp.mapping = imp.mapping.map((m, j) => (j !== i && m === v ? '' : m));   // each field once
    imp.mapping[i] = v;
    renderImport();
  },
};

/* ---- Text inputs (data-input) ---- */
let critCounter = 0;
function updateReportResults() { const host = $('#rep-results'); if (host) host.innerHTML = reportsResults(); }
const INPUTS = {
  'db-search': (el) => { state.db.q = el.value; updateDbResults(); },
  'rep-search': (el) => { state.reports.q = el.value; updateReportResults(); },
  'pick-player-search': (el) => {
    state.pick.q = el.value;
    const host = $('#pick-player-results'); if (host) host.innerHTML = pickPlayerResults();
    const add = $('#pick-player-new'); if (add) add.innerHTML = pickNewRow();
  },
  'rq-player-search': (el) => { const host = $('#rq-player-results'); if (host) host.innerHTML = rqSuggestions(el.value); const err = $('#rq-player-q-error'); if (err) err.hidden = true; },
  'need-pick-search': (el) => {
    state.needs.pickQ = el.value;
    const need = NeedStore.get(state.needs.selected);
    const host = $('#pick-results');
    if (host && need) host.innerHTML = pickerResults(need);
  },
};
function updateDbResults() {
  const host = $('#db-results');
  if (host) host.innerHTML = dbResults();
}

/* ---- Form handlers (data-form) ---- */
const FORMS = {
  'st-team': async (form) => {
    const input = form.querySelector('#st-name');
    const name = input.value.trim();
    const err = form.querySelector('#st-name-error');
    if (!name) { err.hidden = false; input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
    try {
      if (form.dataset.id) {
        await ShadowTeamStore.update(form.dataset.id, { name });
        closeDialog();
        toast('Shadow team renamed', 'check');
      } else {
        const formation = form.querySelector('#st-new-formation').value;
        const id = await ShadowTeamStore.create({ name, formation, entries: [] });
        state.shadow.teamId = id;
        state.shadow.pos = null;
        closeDialog();
        if (state.route === 'squad-shadow-teams') refresh(); else navigate('squad-shadow-teams');
        toast('Shadow team created', 'check');
      }
    } catch (e) {
      toast('Could not save. Your access may be view-only.', 'alert');
    }
  },
  'st-delete': async (form) => {
    try {
      await ShadowTeamStore.remove(form.dataset.id);
      state.shadow.teamId = null;
      state.shadow.pos = null;
      closeDialog();
      refresh();
      toast('Shadow team deleted', 'check');
    } catch (e) {
      toast('Could not delete. Your access may be view-only.', 'alert');
    }
  },
  'st-move': (form) => {
    const toPos = form.querySelector('#st-move-pos').value;
    closeDialog();
    shadowMove(form.dataset.player, form.dataset.from, toPos);
  },
  'add-shadow': (form) => {
    const p = currentPlayer();
    const team = ShadowTeamStore.get(form.querySelector('#add-team').value);
    if (!p || !team) return;
    const pos = form.querySelector('#add-pos').value;
    const rank = form.querySelector('#add-rank').value;
    const note = form.querySelector('#add-note').value.trim();
    const entry = { playerId: p.id, positionId: pos, note, addedAt: new Date().toISOString() };
    const entries = ShadowOps.add(team, entry, pos, rank === 'end' ? undefined : Number(rank));
    closeDialog();
    writeEntries(team, entries, `Added to ${team.name} · ${pos}`);
  },
  'note': async (form) => {
    const input = form.elements.namedItem('text');
    const text = input ? input.value.trim() : '';
    if (!text) { showFieldError(input); return; }
    const category = form.elements.namedItem('category').value;
    input.value = '';   // cleared first, so a re-render while saving does not bring the text back
    try {
      await NoteStore.create({ playerId: form.dataset.player, text, category, authorId: Viewer.id || '' });
      toast('Note saved', 'check');
    } catch (err) {
      const el = document.getElementById('note-text');
      if (el && !el.value) el.value = text;
      toast(SAVE_ERROR, 'alert');
    }
  },
  'note-edit': async (form) => {
    const input = form.elements.namedItem('text');
    const text = input.value.trim();
    if (!text) { showFieldError(input); return; }
    try {
      await NoteStore.update(form.dataset.id, { text, category: form.elements.namedItem('category').value });
      closeDialog();
      toast('Note updated', 'check');
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'note-delete': async (form) => {
    closeDialog();
    try { await NoteStore.remove(form.dataset.id); toast('Note deleted', 'check'); } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },

  'player-new': async (form, e) => {
    if (!requireName(form)) return;
    const data = readPlayerForm(form);
    const next = e && e.submitter ? e.submitter.value : 'open';
    try {
      const id = await PlayerStore.create({ internalStatus: 'untracked', ...data });
      toast(`${data.name} added`, 'check');
      if (next === 'open') { closeDialog(); openPlayer(id); }
      else { form.reset(); form.elements.namedItem('name').focus(); }
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'player-edit': async (form) => {
    if (!requireName(form)) return;
    try {
      await PlayerStore.update(form.dataset.id, readPlayerForm(form));
      const fin = readFinanceForm(form);
      if (fin && can('financial.edit') && FinanceStore.started()) await FinanceStore.set(form.dataset.id, fin);
      closeDialog();
      toast('Player updated', 'check');
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'invite': async (form) => {
    if (!invite) return;
    if (invite.step === 1) {
      const input = form.elements.namedItem('email');
      const email = input.value.trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { showFieldError(input, 'Enter a valid email address.'); return; }
      if (InviteStore.list().some((i) => i.status === 'pending' && i.email === email)) { showFieldError(input, 'This email already has an open invitation.'); return; }
      if (activeMembers().some((m) => (m.email || '').toLowerCase() === email) || (Viewer.isOwner && (Viewer.email || '').toLowerCase() === email)) { showFieldError(input, 'This person is already a member.'); return; }
      invite.email = email;
      invite.step = 2;
    } else if (invite.step === 2) {
      const picked = form.querySelector('input[name="role"]:checked');
      const role = picked ? picked.value : invite.role;
      if (role !== invite.role) invite.perms = roleDefaults(role);
      invite.role = role;
      invite.step = 3;
    } else if (invite.step === 3) {
      invite.perms = editorSet(form);
      invite.step = 4;
    } else if (invite.step === 4) {
      try {
        invite.created = await InviteStore.create({ email: invite.email, role: invite.role, overrides: overridesFrom(invite.perms, invite.role), status: 'pending', invitedAt: new Date().toISOString(), invitedBy: Viewer.id || '' });
        invite.step = 5;
      } catch (err) { toast(SAVE_ERROR, 'alert'); return; }
    }
    renderInviteDialog();
  },
  'member': async (form) => {
    const id = form.dataset.id;
    const m = MemberStore.get(id);
    if (!m) { closeDialog(); return; }
    const roleEl = form.elements.namedItem('role');
    const role = can('users.editRole') && roleEl ? roleEl.value : m.role;
    const overrides = can('users.editPermissions') ? overridesFrom(editorSet(form), role) : (role === m.role ? m.overrides : {});
    try {
      const { id: _id, ...record } = m;
      await MemberStore.set(id, { ...record, role, overrides });
      closeDialog();
      toast('Access updated', 'check');
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'member-remove': async (form) => {
    const id = form.dataset.id;
    closeDialog();
    try {
      await MemberStore.remove(id);
      for (const inv of InviteStore.list().filter((i) => i.userId === id)) await InviteStore.remove(inv.id);
      toast('Removed from the organization', 'check');
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'activate': async (form) => {
    const id = form.dataset.id;
    const sel = form.elements.namedItem('invite');
    const inv = sel && InviteStore.get(sel.value);
    if (!inv) { if (sel) showFieldError(sel); return; }
    const verified = ((People.get(id) || {}).email || '').toLowerCase();
    try {
      await MemberStore.set(id, { userId: id, role: inv.role, overrides: inv.overrides, status: 'active', email: verified || inv.email, inviteId: inv.id, joinedAt: new Date().toISOString() });
      await InviteStore.update(inv.id, { status: 'accepted', userId: id });
      if (JoinRequestStore.get(id)) await JoinRequestStore.remove(id);
      closeDialog();
      toast(`${personName(id)} can now use the platform`, 'check');
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'positions': async (form, e) => {
    const goNext = !!(e && e.submitter && e.submitter.value === 'next');
    const picked = form.querySelector('input[name="position"]:checked');
    if (!picked) {
      const out = document.getElementById('pos-summary');
      if (out) { out.textContent = 'Choose the primary position.'; out.classList.add('field-error'); }
      const first = form.querySelector('input[name="position"]');
      if (first) first.focus();
      return;
    }
    const position = picked.value;
    const secondaryPositions = $$('input[name="secondary"]:checked', form).map((i) => i.value).filter((x) => x !== position);
    const current = PlayerStore.get(form.dataset.id);
    const next = goNext && current ? playersWithoutPosition(current)[0] : null;
    try {
      await PlayerStore.update(form.dataset.id, { position, secondaryPositions });
      toast('Positions saved', 'check');
      // Keep the dialog open and swap its content: closing it would clear the new content on the close event.
      if (next && PlayerStore.get(next.id)) { openPlayer(next.id); openPositionsDialog(PlayerStore.get(next.id)); }
      else closeDialog();
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'player-delete': async (form) => {
    const id = form.dataset.id;
    closeDialog();
    try {
      await deletePlayer(id);
      state.playerId = null;
      navigate('players-database');
      toast('Player deleted', 'check');
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'squad-new': async (form, e) => {
    if (!requireName(form) || !checkShirt(form, null)) return;
    const data = readPlayerForm(form);
    const next = e && e.submitter ? e.submitter.value : 'done';
    try {
      const id = await PlayerStore.create({ internalStatus: 'untracked', ...data });
      await SquadStore.set(id, squadBody(form, id));
      toast(`${data.name} added to the squad`, 'check');
      if (next === 'another') { form.reset(); form.elements.namedItem('name').focus(); }
      else closeDialog();
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'report': async (form) => {
    const data = readReportForm(form);
    if (!validateReport(form, data)) return;
    const playerId = form.dataset.player;
    try {
      if (form.dataset.id) {
        await ReportStore.update(form.dataset.id, data);
        closeDialog();
        toast('Report updated', 'check');
        return;
      }
      const id = await ReportStore.create({ playerId, authorId: Viewer.id || '', ...data });
      if (form.dataset.request) await RequestStore.update(form.dataset.request, { status: 'done', doneReportId: id });
      openNextStep(id);
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'report-delete': async (form) => {
    closeDialog();
    try { await ReportStore.remove(form.dataset.id); toast('Report deleted', 'check'); } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'next-step': async (form) => {
    const r = ReportStore.get(form.dataset.report);
    const p = r && PlayerStore.get(r.playerId);
    if (!r || !p) { closeDialog(); return; }
    const val = (n) => { const el = form.elements.namedItem(n); return el ? el.value.trim() : ''; };
    try {
      if (r.recommendation === 'sign') {
        const needId = val('need');
        await addCandidate(needId, p.id);
        await PlayerStore.update(p.id, { internalStatus: 'shortlisted', closed: null });
        const need = NeedStore.get(needId);
        toast(`${p.name} shortlisted for ${need ? needLabel(need) : 'the need'}`, 'check');
      } else if (r.recommendation === 'again') {
        await RequestStore.create({ playerId: p.id, needId: r.needId, dueBy: val('ns_due'), assigneeId: Viewer.id || '', createdBy: Viewer.id || '', match: val('ns_match'), note: val('ns_note'), status: 'open', reportId: r.id });
        toast(`Assignment created for ${p.name}`, 'check');
      } else if (r.recommendation === 'monitor') {
        await PlayerStore.update(p.id, { internalStatus: 'monitoring', reviewOn: val('ns_review'), closed: null });
        toast(`${p.name} added to the watchlist`, 'check');
      } else {
        await PlayerStore.update(p.id, { closed: { reason: r.closeReason, date: todayIso(), reportId: r.id } });
        const need = r.needId ? NeedStore.get(r.needId) : null;
        if (need && need.candidates.some((c) => c.playerId === p.id)) {
          await NeedStore.update(need.id, { candidates: need.candidates.filter((c) => c.playerId !== p.id) });
        }
        toast(`${p.name} closed as not for us`, 'check');
      }
      closeDialog();
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'request': async (form) => {
    const val = (n) => { const el = form.elements.namedItem(n); return el && !el.disabled ? el.value.trim() : ''; };
    const existing = form.dataset.id ? RequestStore.get(form.dataset.id) : null;
    // Player: the one chosen, a new name, or what was typed (an exact name in the database, otherwise a new player).
    let playerId = form.elements.namedItem('rq_player').value;
    let newName = form.elements.namedItem('rq_new').value.trim();
    const typed = val('rq_player_q');
    if (!playerId && !newName && typed) {
      const same = PlayerStore.list().filter((p) => normText(p.name) === normText(typed) || normText(p.fullName) === normText(typed));
      if (same.length === 1) playerId = same[0].id;
      else if (can('players.create')) newName = typed.slice(0, 80);
    }
    if (!playerId && (!newName || !can('players.create'))) { showFieldError($('#rq-player-q', form)); return; }
    // Scout: assigning to someone else needs "Create assignments"; without it, an assignment is always your own.
    let assigneeId = existing ? existing.assigneeId : (Viewer.id || '');
    let scout = existing ? existing.scout : '';
    if (canAssignOthers()) {
      const picked = val('rq_assignee');
      if (picked === OTHER_SCOUT) {
        scout = val('rq_scout');
        if (!scout) { showFieldError(form.elements.namedItem('rq_scout')); return; }
        assigneeId = '';
      } else { assigneeId = picked; scout = ''; }
    }
    const data = { dueBy: val('rq_due'), assigneeId, scout, match: val('rq_match'), note: val('rq_note') };
    if (!existing) Object.assign(data, { createdBy: Viewer.id || '', needId: '' });
    try {
      if (!playerId) {
        playerId = await PlayerStore.create({ internalStatus: 'untracked', name: newName });
        toast(`${newName} added`, 'check');
      }
      data.playerId = playerId;
      if (existing) await RequestStore.update(existing.id, data);
      else await RequestStore.create({ status: 'open', ...data });
      closeDialog();
      toast(existing ? 'Assignment updated' : 'Assignment created', 'check');
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'pick-player-new': async (form) => {
    if (!requireName(form)) return;
    const data = readPlayerForm(form);
    try {
      const id = await PlayerStore.create({ internalStatus: 'untracked', ...data });
      toast(`${data.name} added`, 'check');
      openReportDialog(PlayerStore.get(id) || { id, secondaryPositions: [], contract: {}, ...data });
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'criteria': async (form) => {
    const attributes = Object.fromEntries(ATTRIBUTE_GROUPS.map((g) => [g.id,
      $$(`input[name="crit_${g.id}"]`, form).map((i) => fromPortuguese(i.value, DEFAULT_ATTRIBUTE_NAMES)).filter(Boolean).slice(0, MAX_ATTRIBUTES)]));
    const short = ATTRIBUTE_GROUPS.find((g) => attributes[g.id].length < MIN_ATTRIBUTES);
    if (short) { toast(`${short.label} needs ${MIN_ATTRIBUTES} to ${MAX_ATTRIBUTES} attributes.`, 'alert'); return; }
    try { await SettingsStore.set('evaluation', { attributes }); toast('Evaluation criteria saved', 'check'); } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'need': async (form) => {
    const pos = form.elements.namedItem('position');
    if (!pos.value) { showFieldError(pos); return; }
    const data = readNeedForm(form);
    if (data.ageMin !== null && data.ageMax !== null && data.ageMax < data.ageMin) { showFieldError(form.elements.namedItem('ageMax')); return; }
    try {
      if (form.dataset.id) {
        await NeedStore.update(form.dataset.id, data);
        closeDialog();
        toast('Need updated', 'check');
      } else {
        const id = await NeedStore.create({ season: SEASON.id, status: 'open', candidates: [], ...data });
        closeDialog();
        state.needs.selected = id;
        navigate('squad-needs');
        $('#content').scrollTop = 0;
        toast('Need created', 'check');
      }
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'need-delete': async (form) => {
    closeDialog();
    try {
      await NeedStore.remove(form.dataset.id);
      state.needs.selected = null;
      refresh();
      toast('Need deleted', 'check');
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'link-need': async (form) => {
    const sel = form.querySelector('#link-need');
    if (!sel) return;
    const need = NeedStore.get(sel.value);
    try {
      await addCandidate(sel.value, form.dataset.player);
      const pl = PlayerStore.get(form.dataset.player);
      if (pl && ['untracked', 'monitoring', 'scouting', undefined, ''].includes(pl.internalStatus)) {
        await PlayerStore.update(pl.id, { internalStatus: 'shortlisted', closed: null });
      }
      closeDialog();
      toast(`Shortlisted for ${need ? needLabel(need) : 'the need'}`, 'check');
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
  'squad-member': async (form) => {
    const id = form.dataset.id;
    if (!checkShirt(form, id)) return;
    const wasMember = !!squadMember(id);
    const end = form.elements.namedItem('contractEnd').value;
    try {
      await SquadStore.set(id, squadBody(form, id));
      const p = PlayerStore.get(id);
      if (p && (p.contract.endDate || '') !== end) await PlayerStore.update(id, { contract: { endDate: end } });
      closeDialog();
      toast(wasMember ? 'Squad details saved' : `Added to the ${SEASON.label} squad`, 'check');
    } catch (err) { toast(SAVE_ERROR, 'alert'); }
  },
};

/* ---- Global listeners ---- */
document.addEventListener('click', (e) => {
  if (!e.target.closest('.menu-wrap')) closeMenus();

  const routeEl = e.target.closest('[data-route]');
  if (routeEl) {
    e.preventDefault();
    closeMenus();
    closeDialog();
    setDrawer(false);
    state.needs.selected = null;   // a navigation link always opens the page's main view
    navigate(routeEl.dataset.route);
    return;
  }
  const toggle = e.target.closest('[data-toggle]');
  if (toggle) {
    const id = toggle.dataset.toggle;
    state.groupOpen[id] = !state.groupOpen[id];
    syncSidebar(PAGES[state.route]);
    return;
  }
  const act = e.target.closest('[data-action]');
  if (act) {
    if (act.getAttribute('aria-disabled') === 'true') {
      if (act.dataset.msg) toast(act.dataset.msg);
      return;
    }
    const fn = ACTIONS[act.dataset.action];
    if (!fn) return;
    if (act.dataset.action !== 'toggle-menu') closeMenus();
    // Application-level check: the same rule that hides a control also refuses its action.
    if ((Access.state !== 'ready' && !OPEN_ACTIONS.has(act.dataset.action)) || !permitted(ACTION_GUARDS, act.dataset.action, act)) { toast(NO_PERMISSION, 'lock'); return; }
    fn(act, e);
    return;
  }
  if (e.target.closest('#scrim')) setDrawer(false);
});

document.addEventListener('change', (e) => {
  // Choosing a value on a scale clears that scale's error
  if (e.target.type === 'radio') {
    const box = e.target.closest('.scale, .grade-row');
    const err = box && box.querySelector('.field-error');
    if (err) err.hidden = true;
  }
  const el = e.target.closest('[data-change]');
  if (el && CHANGES[el.dataset.change]) {
    if (!permitted(CHANGE_GUARDS, el.dataset.change, el)) { toast(NO_PERMISSION, 'lock'); return; }
    CHANGES[el.dataset.change](el);
  }
});

document.addEventListener('submit', (e) => {
  const form = e.target.closest('form[data-form]');
  if (!form) return;
  e.preventDefault();
  const fn = FORMS[form.dataset.form];
  if (!fn) return;
  if (Access.state !== 'ready' || !permitted(FORM_GUARDS, form.dataset.form, form)) { toast(NO_PERMISSION, 'lock'); return; }
  fn(form, e);
});

document.addEventListener('input', (e) => {
  const t = e.target;
  if (t.getAttribute && t.getAttribute('aria-invalid') === 'true') {
    t.removeAttribute('aria-invalid');
    const err = document.getElementById(`${t.id}-error`);
    if (err) err.hidden = true;
  }
  const el = t.closest && t.closest('[data-input]');
  if (el && INPUTS[el.dataset.input]) INPUTS[el.dataset.input](el);
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    const openMenu = $('.menu:not([hidden])');
    if (openMenu) {
      closeMenus();
      const t = document.querySelector(`[aria-controls="${openMenu.id}"]`);
      if (t) t.focus();
      return;
    }
    setDrawer(false);
    return;
  }
  // Arrow keys move between tabs
  if ((e.key === 'ArrowRight' || e.key === 'ArrowLeft') && e.target.getAttribute('role') === 'tab') {
    const tabs = $$('[role="tab"]', e.target.parentElement);
    const i = tabs.indexOf(e.target) + (e.key === 'ArrowRight' ? 1 : -1);
    const next = tabs[(i + tabs.length) % tabs.length];
    if (next) next.click();
    return;
  }
  // Arrow keys move within an open menu
  if ((e.key === 'ArrowDown' || e.key === 'ArrowUp') && e.target.closest('.menu')) {
    e.preventDefault();
    const items = $$('.menu-item', e.target.closest('.menu'));
    const i = items.indexOf(e.target) + (e.key === 'ArrowDown' ? 1 : -1);
    const next = items[(i + items.length) % items.length];
    if (next) next.focus();
  }
});

/* ---- Drag and drop (shadow team lists) ----
   Entries drag within a list to change priority, or onto a pitch position
   to change position. Drags that carry 'application/x-player-id' (from the
   future Player Database) add a new entry at the drop point. */
let drag = null;
const clearOver = () => $$('.is-over').forEach((n) => n.classList.remove('is-over'));
function endDrag() { drag = null; clearOver(); $$('.is-dragging').forEach((n) => n.classList.remove('is-dragging')); }

document.addEventListener('dragstart', (e) => {
  const row = e.target.closest && e.target.closest('.st-entry[draggable="true"]');
  if (!row) return;
  drag = { playerId: row.dataset.player, fromPos: row.dataset.pos };
  e.dataTransfer.effectAllowed = 'move';
  try { e.dataTransfer.setData('text/plain', row.dataset.player); } catch (err) { /* ignore */ }
  row.classList.add('is-dragging');
});
document.addEventListener('dragover', (e) => {
  const target = e.target.closest && e.target.closest('[data-drop]');
  if (!target) return;
  const external = !drag && e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('application/x-player-id');
  if (!drag && !external) return;
  e.preventDefault();
  e.dataTransfer.dropEffect = drag ? 'move' : 'copy';
  if (!target.classList.contains('is-over')) { clearOver(); target.classList.add('is-over'); }
});
document.addEventListener('dragleave', (e) => {
  const target = e.target.closest && e.target.closest('[data-drop]');
  if (target && !target.contains(e.relatedTarget)) target.classList.remove('is-over');
});
document.addEventListener('drop', (e) => {
  const target = e.target.closest && e.target.closest('[data-drop]');
  if (!target) return;
  e.preventDefault();
  const toPos = target.dataset.pos;
  const index = target.dataset.drop === 'node' ? undefined : Number(target.dataset.index);
  if (drag) {
    shadowMove(drag.playerId, drag.fromPos, toPos, index);
  } else {
    const playerId = e.dataTransfer.getData('application/x-player-id');
    const team = currentTeam();
    if (playerId && team) writeEntries(team, ShadowOps.add(team, { playerId, positionId: toPos, note: '', addedAt: new Date().toISOString() }, toPos, index), `Added to ${toPos}`);
  }
  endDrag();
});
document.addEventListener('dragend', endDrag);

/* ---- Dropping a file on the import drop zone ---- */
const carriesFiles = (e) => e.dataTransfer && Array.from(e.dataTransfer.types || []).includes('Files');
document.addEventListener('dragover', (e) => {
  if (!carriesFiles(e)) return;
  e.preventDefault();   // never let a stray file drop navigate the page
  const zone = e.target.closest && e.target.closest('[data-dropzone]');
  e.dataTransfer.dropEffect = zone ? 'copy' : 'none';
  $$('[data-dropzone]').forEach((z) => z.classList.toggle('is-over', z === zone));
});
document.addEventListener('dragleave', (e) => {
  const zone = e.target.closest && e.target.closest('[data-dropzone]');
  if (zone && !zone.contains(e.relatedTarget)) zone.classList.remove('is-over');
});
document.addEventListener('drop', (e) => {
  if (!carriesFiles(e)) return;
  e.preventDefault();
  const zone = e.target.closest && e.target.closest('[data-dropzone]');
  if (!zone) return;
  zone.classList.remove('is-over');
  const file = e.dataTransfer.files && e.dataTransfer.files[0];
  if (file && imp) importFile(file);
});

window.addEventListener('popstate', () => navigate(routeFromHash(), { record: false }));
window.addEventListener('hashchange', () => { if (routeFromHash() !== state.route) navigate(routeFromHash(), { record: false }); });

STORES.forEach((s) => s.subscribe(queueRefresh));

// Nothing is shown or loaded until the viewer's access is known.
async function boot() {
  renderSidebar();
  navigate(routeFromHash(), { record: false });
  try { await resolveAccess(); } catch (err) { console.error(err); Access.state = 'unknown'; }
  renderSidebar();
  navigate(routeFromHash(), { record: false });
}
boot();
