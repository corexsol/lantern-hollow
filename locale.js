/* Lantern Hollow — reversible English/Arabic UI localization. No network assets. */
(function (scope) {
  "use strict";
  const dictionary = Object.create(null);
  const reverse = new Map();
  const rendered = new Map();
  const sources = new WeakMap();
  const roots = new Map();
  let userNames = new Set();
  let language = "en";
  const storageKey = "lantern-hollow-language";

  function register(map) {
    for (const [english, arabic] of Object.entries(map || {})) {
      if (typeof arabic !== "string") continue;
      dictionary[english] = arabic;
      if (!reverse.has(arabic)) reverse.set(arabic, english);
      if (/[a-z]/.test(english)) {
        dictionary[english.toUpperCase()] = arabic;
      }
    }
    if (language === "ar") refreshAll();
  }

  register({
    Doctor: "الطبيب",
    Investigator: "المحقق",
    Police: "الشرطي",
    Lookout: "المراقب",
    Tracker: "المتعقب",
    Trapper: "نصّاب الفخاخ",
    Snitch: "الواشي",
    Provoker: "المحرّض",
    Insane: "الواهم",
    Impostor: "المحتال",
    Cleaner: "مخفي الآثار",
    Blamer: "ملفّق التهم",
    Survivor: "الناجي",
    "Serial Killer": "القاتل المتسلسل",
    Bomber: "المفجّر",
    Thief: "اللص",
    Haunter: "المنتقم",
    Sorcerer: "الساحر",
    Innocents: "الأبرياء",
    Impostors: "المحتالون",
    Neutral: "محايد",
    Neutrals: "المحايدون",
    Protect: "احمِ",
    Investigate: "تحقّق",
    Block: "امنع",
    Watch: "راقب",
    Track: "تتبّع",
    "Set trap": "انصب فخًا",
    Expose: "اكشف",
    Provoke: "حرّض",
    Act: "تصرّف",
    "Faction attack": "هجوم الفريق",
    Clean: "أخفِ الآثار",
    Frame: "لفّق التهمة",
    "Use vest": "استخدم السترة",
    Attack: "هاجم",
    "Plant bomb": "ازرع قنبلة",
    "Steal role": "اسرق الدور",
    Mark: "ضع علامة",
    "Guess & attack": "خمّن وهاجم",
    "Protect one resident from all attacks tonight. You may protect yourself.":
      "احمِ أحد السكان من جميع الهجمات هذه الليلة. يمكنك حماية نفسك.",
    "Remove every Impostor and hostile Neutral.":
      "تخلّص من جميع المحتالين والمحايدين المعادين.",
    "Learn a resident’s alignment privately. A Blamer can falsify this result.":
      "اعرف انتماء أحد السكان سرًا. يستطيع ملفّق التهم تزوير هذه النتيجة.",
    "Block a resident’s abilities and faction attack tonight. Police blocks resolve simultaneously before traps.":
      "امنع قدرات أحد السكان وهجوم فريقه هذه الليلة. تُنفّذ موانع الشرطة معًا قبل الفخاخ.",
    "Learn who visited a chosen house. You do not learn visitors’ roles.":
      "اعرف من زار منزلًا تختاره. لن تعرف أدوار الزوار.",
    "Discover every house a resident attempted to visit tonight, even if blocked.":
      "اكتشف كل منزل حاول أحد السكان زيارته هذه الليلة، حتى لو مُنع من التصرف.",
    "Intercept the first non-Police visitor to a chosen house. That visitor’s actions are blocked. One-night trap.":
      "اعترض أول زائر غير شرطي لمنزل تختاره وامنع تصرفاته. يستمر الفخ ليلة واحدة.",
    "Publicly announce a resident’s alignment at sunrise. A Blamer can falsify it.":
      "أعلن انتماء أحد السكان للجميع عند الشروق. يستطيع ملفّق التهم تزويره.",
    "Add one automatic vote against a resident in tomorrow’s ballot. The extra vote is public.":
      "أضف صوتًا تلقائيًا ضد أحد السكان في اقتراع الغد. يظهر الصوت الإضافي للجميع.",
    "You believe you are another Innocent role. Your ability has no effect; any private results are unreliable. Your true role stays hidden until the match ends.":
      "تعتقد أنك تؤدي دورًا آخر من الأبرياء. قدرتك بلا تأثير ونتائجك الخاصة غير موثوقة. يبقى دورك الحقيقي مخفيًا حتى نهاية المباراة.",
    "Your team has one shared attack each night. Your living teammates are known to you.":
      "لفريقك هجوم مشترك واحد كل ليلة. تعرف زملاءك الأحياء في الفريق.",
    "Reach parity with the other residents after hostile Neutrals are gone.":
      "اجعل عدد فريقك مساويًا لعدد السكان الآخرين بعد زوال المحايدين المعادين.",
    "If your chosen resident dies tonight, a Thief cannot copy their role. Your team also has one shared attack.":
      "إذا مات الشخص الذي تختاره هذه الليلة، فلن يستطيع اللص نسخ دوره. ولفريقك هجوم مشترك واحد.",
    "Reach parity after hostile Neutrals are gone.":
      "بلغ التعادل العددي بعد زوال المحايدين المعادين.",
    "Make a resident appear to be an Impostor to investigations and exposure until the next ballot ends. Your team also has one shared attack.":
      "اجعل أحد السكان يبدو محتالًا في التحقيق والكشف حتى انتهاء الاقتراع القادم. ولفريقك هجوم مشترك واحد.",
    "Use one of two vests to resist all attacks tonight. Survive to share the final victory.":
      "استخدم واحدة من سترتين لصد جميع الهجمات هذه الليلة. ابقَ حيًا لتشارك في النصر النهائي.",
    "Be alive when the match ends.": "ابقَ حيًا حتى نهاية المباراة.",
    "Attack one other resident per night. You have no teammates.":
      "هاجم ساكنًا آخر كل ليلة. ليس لديك زملاء في الفريق.",
    "Be the only hostile faction left with at most one other resident.":
      "كن الطرف المعادي الوحيد المتبقي مع ساكن آخر واحد على الأكثر.",
    "Plant one persistent bomb per night or detonate all existing bombs. Detonation does not visit houses.":
      "ازرع قنبلة تبقى في منزل كل ليلة أو فجّر جميع قنابلك المزروعة. التفجير لا يُعد زيارة للمنازل.",
    "Take the actual role and faction of an eliminated resident at night. You cannot steal a hidden role.":
      "خذ الدور الحقيقي وانتماء أحد السكان المستبعدين ليلًا. لا يمكنك سرقة دور مخفي.",
    "Survive until you steal a role; then adopt its objective.":
      "ابقَ حيًا حتى تسرق دورًا، ثم اتبع هدفه.",
    "Mark one resident. If you die while a mark exists, your unpreventable revenge eliminates them. A successful revenge wins your personal objective.":
      "ضع علامة على ساكن. إذا متّ والعلامة موجودة، يستبعده انتقامك الذي لا يمكن منعه. نجاح الانتقام يحقق هدفك الشخصي.",
    "Trigger revenge on a living marked resident before the match ends.":
      "فعّل الانتقام من ساكن حي يحمل علامتك قبل نهاية المباراة.",
    "Guess a resident’s actual role. A correct guess attacks them; a wrong guess kills you, even through protection.":
      "خمّن الدور الحقيقي لأحد السكان. التخمين الصحيح يهاجمه، والخاطئ يقتلك حتى مع وجود حماية.",
    "Shield one house.": "احمِ منزلًا واحدًا.",
    "Search for an Impostor.": "ابحث عن محتال.",
    "Stop a night action.": "امنع تصرفًا ليليًا.",
    "Watch a house.": "راقب منزلًا.",
    "Follow their footsteps.": "تتبّع خطواتهم.",
    "Catch a visitor.": "أمسك بزائر.",
    "Expose their allegiance.": "اكشف انتماءهم.",
    "Add a vote tomorrow.": "أضف صوتًا غدًا.",
    "Trust your ability?": "هل تثق بقدرتك؟",
    "Hunt with your team.": "هاجم مع فريقك.",
    "Hide a victim’s identity.": "أخفِ هوية الضحية.",
    "Make someone look guilty.": "أظهر شخصًا بمظهر المذنب.",
    "Stay alive. Two vests.": "ابقَ حيًا. لديك سترتان.",
    "Be the last threat.": "كن التهديد الأخير.",
    "Plant. Wait. Detonate.": "ازرع. انتظر. فجّر.",
    "Take a fallen role.": "خذ دور أحد المستبعدين.",
    "Mark your revenge.": "حدّد هدف انتقامك.",
    "Guess their role. Attack.": "خمّن دورهم. وهاجم.",
    "HOLD ON…": "تماسك…",
    "REVIVING…": "جارٍ الإنعاش…",
    "SAVED!": "تم إنقاذك!",
    SAVED: "تم الإنقاذ",
    "VEST HELD!": "السترة صدّت الهجوم!",
    "PROTECTED!": "محمي!",
    "YOU WERE KILLED": "قُتلت",
    "ATTACK LANDED": "نجح الهجوم",
    "ACTION BLOCKED": "مُنع التصرف",
    "PROTECTION SET": "تم تفعيل الحماية",
    "RESTING…": "في راحة…",
    "ACTION COMPLETE": "اكتمل التصرف",
    BOOM: "انفجار",
    "VOTE!": "صوّت!",
    "THE END": "النهاية",
    PAUSED: "متوقفة مؤقتًا",
    LANTERN: "قرية",
    HOLLOW: "الفوانيس",
    "LANTERN HOLLOW": "قرية الفوانيس",
    "Lantern Hollow — a village of secrets": "قرية الفوانيس — قرية الأسرار",
    PLAY: "العب",
    "Your character": "شخصيتك",
    "How to play": "طريقة اللعب",
    Settings: "الإعدادات",
    "GET READY": "استعد",
    Back: "رجوع",
    "Resident name": "اسم اللاعب",
    "Your color": "لونك",
    Hat: "القبعة",
    Accessory: "الإكسسوار",
    Glasses: "النظارة",
    Off: "إيقاف",
    On: "تشغيل",
    none: "بدون",
    leaf: "ورقة شجر",
    cap: "قبعة",
    flower: "زهرة",
    crown: "تاج",
    scarf: "وشاح",
    Players: "اللاعبون",
    "Total residents": "عدد السكان",
    "Match settings": "إعدادات المباراة",
    Day: "النهار",
    Vote: "التصويت",
    Night: "الليل",
    "Day · seconds": "النهار · ثوانٍ",
    "Vote · seconds": "التصويت · ثوانٍ",
    "Night · seconds": "الليل · ثوانٍ",
    "Day duration": "مدة النهار",
    "Vote duration": "مدة التصويت",
    "Night duration": "مدة الليل",
    "LET’S GO": "لنبدأ",
    "Your role": "دورك",
    Pause: "إيقاف مؤقت",
    "Pause or resume": "إيقاف مؤقت أو استئناف",
    Sound: "الصوت",
    "Mute or unmute": "كتم الصوت أو تشغيله",
    Menu: "القائمة",
    "Main menu": "القائمة الرئيسية",
    "Private notebook": "دفتر خاص",
    "Public report": "التقرير العام",
    "Role guide": "دليل الأدوار",
    CONVERSATION: "المحادثة",
    "Close conversation": "إغلاق المحادثة",
    "Chat message": "رسالة المحادثة",
    "Send message": "إرسال رسالة",
    Conversation: "المحادثة",
    "Open conversation": "فتح المحادثة",
    Residents: "السكان",
    SECRET: "الدور السري",
    DISCUSS: "ناقش",
    VERDICT: "الحكم",
    CHOOSE: "اختر",
    ASLEEP: "نائم",
    DAWN: "الفجر",
    FINISHED: "انتهت",
    "Who do you trust?": "بمن تثق؟",
    "WHO DO YOU TRUST?": "بمن تثق؟",
    "Choose a neighbor": "اختر أحد الجيران",
    "Choose a house": "اختر منزلًا",
    "Watching the village": "تراقب القرية",
    "EVERYONE SAFE": "الجميع بخير",
    "Say something…": "اكتب رسالة…",
    "Listening…": "تستمع…",
    LIVE: "مباشر",
    "Close selection": "إغلاق الاختيار",
    Accuse: "اتّهم",
    Defend: "دافع",
    "Mark suspicious in notebook": "ضع علامة اشتباه في الدفتر",
    "Mark suspicious": "ضع علامة اشتباه",
    Unknown: "مجهول",
    CONTINUE: "متابعة",
    "START VOTE": "بدء التصويت",
    VOTED: "تم التصويت",
    "Skip vote": "تخطَّ التصويت",
    "Team attack": "هجوم الفريق",
    Plant: "ازرع",
    Detonate: "فجّر",
    "Detonate bombs": "تفجير القنابل",
    "Guess target role": "خمّن دور الهدف",
    "NO VESTS": "لا سترات",
    LOCKED: "تم التأكيد",
    "Finish night": "إنهاء الليل",
    "Sleep without acting": "نم دون تصرف",
    RESULTS: "النتائج",
    "Close dialog": "إغلاق النافذة",
    "Your secret role": "دورك السري",
    "YOUR SECRET": "سرّك",
    Rules: "القواعد",
    "GOT IT": "فهمت",
    "Role reference": "مرجع الأدوار",
    "POSSIBLE ROLES": "الأدوار المحتملة",
    Details: "التفاصيل",
    "Share this clue": "شارك هذا الدليل",
    Notebook: "الدفتر",
    "YOUR CLUES": "أدلّتك",
    "AFTER YOUR FIRST NIGHT": "بعد ليلتك الأولى",
    Trust: "موثوق",
    Uncertain: "غير مؤكد",
    Suspicious: "مشتبه به",
    Dangerous: "خطير",
    "Written notes": "ملاحظات مكتوبة",
    "Your notes…": "ملاحظاتك…",
    "Public record": "السجل العام",
    "VILLAGE RECORD": "سجل القرية",
    "NO BALLOTS YET": "لا اقتراع بعد",
    "NO EXILE": "لا نفي",
    "Make yourself comfortable": "اضبط ما يناسبك",
    "A little adjustment.": "بعض التعديلات.",
    "Sound volume": "مستوى الصوت",
    "Mute all sound": "كتم جميع الأصوات",
    "Reduce decorative motion": "تقليل الحركة الزخرفية",
    "Reset camera": "إعادة ضبط الكاميرا",
    "Space pauses a match. Escape closes a dialog. N opens your notebook. R opens the role guide. Scroll to zoom; drag the grass to move the camera.":
      "يوقف المضيف المباراة بمفتاح المسافة. يغلق Escape النافذة، ويفتح N الدفتر، ويفتح R دليل الأدوار. مرّر للتكبير واسحب العشب لتحريك الكاميرا.",
    "READ THE ROOM.": "راقب ما يدور حولك.",
    TALK: "تحدّث",
    "Innocents find the threats.": "الأبرياء يكشفون مصادر الخطر.",
    "Impostors take control.": "المحتالون يسعون للسيطرة.",
    "Neutrals follow their own goal.": "المحايدون يتبعون أهدافهم الخاصة.",
    "LET’S PLAY": "لنلعب",
    "Village ballot": "اقتراع القرية",
    "Who do you believe?": "من تصدّق؟",
    "This dialog pauses the timer. Your vote remains changeable until the ballot closes.":
      "يمكنك تغيير صوتك حتى إغلاق الاقتراع.",
    "Match results": "نتائج المباراة",
    "YOU WIN!": "فزت!",
    DRAW: "تعادل",
    "YOU LOST": "خسرت",
    AGAIN: "مرة أخرى",
    MENU: "القائمة",
    "ALL ROLES": "جميع الأدوار",
    "Paused. Press Space or the play button to resume.":
      "أُوقفت المباراة. اضغط المسافة أو زر التشغيل لاستئنافها.",
    "Camera centered.": "تم توسيط الكاميرا.",
    "That resident is not a valid target for this action.":
      "لا يمكن استهداف هذا الساكن بهذا التصرف.",
    "You have no private clue to share yet.": "ليس لديك دليل خاص لمشاركته بعد.",
    "Select a living neighbor first.": "اختر جارًا حيًا أولًا.",
    "Select a valid house first.": "اختر منزلًا صالحًا أولًا.",
    SKIPPED: "تم التخطي",
    "LOCKED IN": "تم التأكيد",
    "NEW CLUE": "دليل جديد",
    "Keep at least one Innocent and one Impostor role enabled.":
      "فعّل دورًا بريئًا ودور محتال واحدًا على الأقل.",
    "Welcome to Lantern Hollow. Listen carefully: a confident claim is not proof.":
      "مرحبًا بك في قرية الفوانيس. استمع جيدًا: الادعاء الواثق ليس دليلًا.",
    "The ballot is open. A tie means no exile.":
      "بدأ الاقتراع. التعادل يعني عدم نفي أحد.",
    "The council did not reach a verdict. Nobody was exiled.":
      "لم يتوصل المجلس إلى حكم. لم يُنفَ أحد.",
    "Everyone made it through the night.": "نجا الجميع من الليل.",
    "A trap stopped your action tonight.": "أوقف فخ تصرفك هذه الليلة.",
    "Your action was blocked tonight.": "مُنع تصرفك هذه الليلة.",
    "You have no vests left.": "لم تتبقَّ لديك سترات.",
    "Your protection was prepared.": "تم تجهيز حمايتك.",
    "You survived an attack thanks to protection.":
      "نجوت من هجوم بفضل الحماية.",
    "Your attack was prevented.": "تم صد هجومك.",
    "The village fell silent": "خيّم الصمت على القرية",
    "The Hollow is safe": "القرية آمنة",
    "The shadows take the Hollow": "سيطرت الظلال على القرية",
    "The council declares a stalemate": "أعلن المجلس التعادل",
    "CREATE ROOM": "إنشاء غرفة",
    "JOIN ROOM": "الانضمام إلى غرفة",
    "ROOM CODE": "رمز الغرفة",
    "COPY CODE": "نسخ الرمز",
    "COPY LINK": "نسخ الرابط",
    READY: "جاهز",
    "NOT READY": "غير جاهز",
    "START MATCH": "بدء المباراة",
    "WAITING FOR HOST": "بانتظار المضيف",
    "ROOM FULL": "الغرفة ممتلئة",
    "ROOM NOT FOUND": "لم يُعثر على الغرفة",
    "CONNECTION LOST": "انقطع الاتصال",
    RECONNECTING: "جارٍ إعادة الاتصال",
    "LEAVE ROOM": "مغادرة الغرفة",
    HOST: "المضيف",
    CONNECTED: "متصل",
    DISCONNECTED: "غير متصل",
    CONNECTING: "جارٍ الاتصال",
    "CUSTOM GAME": "مباراة مخصصة",
    RANDOM: "عشوائي",
    "ENABLED ROLES": "الأدوار المفعّلة",
    "DAY TIMER": "مدة النهار",
    "VOTE TIMER": "مدة التصويت",
    "NIGHT TIMER": "مدة الليل",
    "MINIMUM 4 PLAYERS": "أربعة لاعبين على الأقل",
    "EVERYONE MUST BE READY": "يجب أن يكون الجميع جاهزين",
    "ONLY THE HOST CAN DO THAT": "المضيف وحده يستطيع فعل ذلك",
    "HOST LEFT": "غادر المضيف",
    REMATCH: "مباراة جديدة",
    RESUME: "استئناف",
    "ONLINE WITH FRIENDS": "العب عبر الإنترنت مع أصدقائك",
    English: "الإنجليزية",
    Arabic: "العربية",
    Language: "اللغة",
    "Invite friends": "ادعُ أصدقاءك",
    "Room settings": "إعدادات الغرفة",
    "Code copied": "تم نسخ الرمز",
    "Link copied": "تم نسخ الرابط",
    "Invalid room code": "رمز الغرفة غير صالح",
    "Enter a six-character room code.": "أدخل رمز الغرفة المكوّن من ستة أحرف.",
    "Room code must be six letters or digits.":
      "يجب أن يتكوّن رمز الغرفة من ستة أحرف أو أرقام.",
    "Could not connect to the room.": "تعذّر الاتصال بالغرفة.",
    "Connection failed": "فشل الاتصال",
    "Network unavailable": "الشبكة غير متاحة",
    "The host has left. The room is closed.": "غادر المضيف. أُغلقت الغرفة.",
    "The host must keep this tab open.":
      "يجب أن يبقي المضيف علامة التبويب هذه مفتوحة.",
    "Waiting for players": "بانتظار اللاعبين",
    "Waiting for the host": "بانتظار المضيف",
    "Your browser does not support WebRTC.": "متصفحك لا يدعم اتصال WebRTC.",
    "Unable to copy. Copy the code manually.":
      "تعذّر النسخ. انسخ الرمز يدويًا.",
    "The room is full.": "الغرفة ممتلئة.",
    "Only the host can do that.": "المضيف وحده يستطيع فعل ذلك.",
    "A match is already in progress.": "هناك مباراة جارية بالفعل.",
    "Everyone must be ready.": "يجب أن يكون الجميع جاهزين.",
    "Invalid reconnect token.": "رمز استعادة الاتصال غير صالح.",
    "This seat is no longer available.": "لم يعد هذا المقعد متاحًا.",
    "Timers must be between 5 and 600 seconds.":
      "يجب أن تكون المدد بين 5 و600 ثانية.",
    "Impostors must be fewer than half the players.":
      "يجب أن يكون عدد المحتالين أقل من نصف عدد اللاعبين.",
    "Leave at least one Innocent in the match.":
      "اترك بريئًا واحدًا على الأقل في المباراة.",
    "Choose valid roles.": "اختر أدوارًا صالحة.",
    "Enable a role for every selected faction.":
      "فعّل دورًا لكل انتماء اخترته.",
    "Invalid command.": "أمر غير صالح.",
    "Your seat is disconnected.": "انقطع اتصال مقعدك.",
    "Ready checks are closed.": "انتهى تأكيد الجاهزية.",
    "Choose a ready status.": "اختر حالة الجاهزية.",
    "Settings are locked during a match.":
      "لا يمكن تغيير الإعدادات أثناء المباراة.",
    "Invalid settings.": "إعدادات غير صالحة.",
    "There is no active match.": "لا توجد مباراة جارية.",
    "Choose a pause status.": "اختر حالة الإيقاف المؤقت.",
    "Voting is closed.": "التصويت مغلق.",
    "Choose a living player.": "اختر لاعبًا حيًا.",
    "Your vote is already locked.": "تم تأكيد صوتك بالفعل.",
    "Night actions are closed.": "التصرفات الليلية مغلقة.",
    "That ability is unavailable.": "هذه القدرة غير متاحة.",
    "There are no planted bombs.": "لا توجد قنابل مزروعة.",
    "Choose a valid target.": "اختر هدفًا صالحًا.",
    "Choose a valid role guess.": "اختر تخمينًا صالحًا للدور.",
    "Your action is already locked.": "تم تأكيد تصرفك بالفعل.",
    "Conversation is closed.": "المحادثة مغلقة.",
    "Write a message of 1 to 180 characters.":
      "اكتب رسالة من حرف واحد إلى 180 حرفًا.",
    "Finish this match first.": "أنه هذه المباراة أولًا.",
    "Choose another player.": "اختر لاعبًا آخر.",
    "Secure randomness is unavailable in this browser.":
      "التوليد العشوائي الآمن غير متاح في هذا المتصفح.",
    "Unable to join this room.": "تعذّر الانضمام إلى هذه الغرفة.",
    "That room code is already in use. Create another room.":
      "رمز الغرفة مستخدم بالفعل. أنشئ غرفة أخرى.",
    "Room not found. Check the code and make sure the host is online.":
      "لم يُعثر على الغرفة. تحقّق من الرمز ومن اتصال المضيف.",
    "This browser does not support the required WebRTC connection.":
      "هذا المتصفح لا يدعم اتصال WebRTC المطلوب.",
    "Cannot reach the connection service. Check your internet connection.":
      "تعذّر الوصول إلى خدمة الاتصال. تحقّق من اتصالك بالإنترنت.",
    "The connection service is unavailable. Try connecting again.":
      "خدمة الاتصال غير متاحة. حاول الاتصال مجددًا.",
    "The connection service closed. Try connecting again.":
      "أُغلقت خدمة الاتصال. حاول الاتصال مجددًا.",
    "Browsers could not establish a connection. Try another network or configure a TURN relay.":
      "تعذّر إنشاء اتصال بين المتصفحات. جرّب شبكة أخرى أو اضبط خادم ترحيل TURN.",
    "Unable to establish the room connection. Try again.":
      "تعذّر إنشاء اتصال بالغرفة. حاول مجددًا.",
    "A player profile and reconnect token are required.":
      "يلزم ملف لاعب ورمز لاستعادة الاتصال.",
    "Enter a six-character room code using letters and numbers.":
      "أدخل رمز الغرفة المكوّن من ستة أحرف أو أرقام.",
    "The connection library could not load. Reload the page and try again.":
      "تعذّر تحميل مكتبة الاتصال. أعد تحميل الصفحة وحاول مجددًا.",
    "The previous connection was closed.": "أُغلق الاتصال السابق.",
    "Connection timed out. Check the code and network, then try again.":
      "انتهت مهلة الاتصال. تحقّق من الرمز والشبكة ثم حاول مجددًا.",
    "Connection timed out. Try joining again.":
      "انتهت مهلة الاتصال. حاول الانضمام مجددًا.",
    "Reconnecting to the connection service. Existing players may remain connected.":
      "جارٍ إعادة الاتصال بالخدمة. قد يبقى اللاعبون الحاليون متصلين.",
    "Cannot reconnect to the connection service. Existing players may remain connected.":
      "تعذّرت إعادة الاتصال بالخدمة. قد يبقى اللاعبون الحاليون متصلين.",
    "The host disconnected. Rejoin when the host is online.":
      "انقطع اتصال المضيف. انضم مجددًا عندما يعود للاتصال.",
    "The room connection closed.": "أُغلق اتصال الغرفة.",
    "The room sent an invalid connection message.":
      "أرسلت الغرفة رسالة اتصال غير صالحة.",
    "Invalid room handshake. Reload the page and try again.":
      "تعذّر التحقق من اتصال الغرفة. أعد تحميل الصفحة وحاول مجددًا.",
    "The connection was closed.": "أُغلق الاتصال.",
    "A match needs 4 to 12 players.": "تحتاج المباراة من 4 إلى 12 لاعبًا.",
    "Every player must be connected and ready.":
      "يجب أن يكون كل لاعب متصلًا وجاهزًا.",
    "The match has not started.": "لم تبدأ المباراة بعد.",
    "The match is paused.": "المباراة متوقفة مؤقتًا.",
    "Wait for the verdict to finish.": "انتظر حتى انتهاء مشهد الحكم.",
    "Wait for the night scenes to finish.": "انتظر حتى انتهاء المشاهد الليلية.",
    "This phase cannot advance.": "لا يمكن الانتقال من هذه المرحلة.",
    seconds: "ثوانٍ",
    "My latest clue:": "آخر دليل لدي:",
    "Enter a valid six-character room code.":
      "أدخل رمز غرفة صالحًا من ستة أحرف أو أرقام.",
  });

  const patterns = [
    [
      /^Your trap intercepted (.+) at (.+)’s house\.$/s,
      (_, a, b) => `اعترض فخك ${a} عند منزل ${b}.`,
    ],
    [
      /^Your vest is active\. (\d+) remain\.$/,
      (_, n) => `سترتك فعّالة. تبقّى ${n}.`,
    ],
    [
      /^Your revenge is bound to (.+)\.$/s,
      (_, name) => `ارتبط انتقامك بـ ${name}.`,
    ],
    [
      /^A bomb is planted at (.+)’s house\.$/s,
      (_, name) => `زُرعت قنبلة في منزل ${name}.`,
    ],
    [
      /^An anonymous exposure says (.+) appears aligned with (Innocents|Impostors|Neutral)\.$/s,
      (_, name, faction) =>
        `أعلن مصدر مجهول أن ${name} يبدو من ${dictionary[faction]}.`,
    ],
    [
      /^(.+) appears aligned with (Innocents|Impostors|Neutral)\.$/s,
      (_, name, faction) => `يبدو أن ${name} ينتمي إلى ${dictionary[faction]}.`,
    ],
    [
      /^(.+)’s visitors: (.*)\.$/s,
      (_, name, names) =>
        `زوار ${name}: ${names === "nobody" && !userNames.has("nobody") ? "لا أحد" : names}.`,
    ],
    [
      /^(.+) visited: (.*)\.$/s,
      (_, name, names) =>
        `زار ${name}: ${names === "no house" && !userNames.has("no house") ? "لم يزر أي منزل" : names}.`,
    ],
    [
      /^Your exposure of (.+) was published\.$/s,
      (_, name) => `نُشر كشفك عن ${name}.`,
    ],
    [
      /^You stole (.+)’s role: (.+)\. Your objective has changed\.$/s,
      (_, name, role) =>
        `سرقت دور ${name}: ${dictionary[role] || role}. تغيّر هدفك.`,
    ],
    [
      /^(.+) was lost during the night\.(?: Role: (.+)\.)?$/s,
      (_, name, role) =>
        `فُقد ${name} أثناء الليل.${role ? ` الدور: ${dictionary[role] || role}.` : ""}`,
    ],
    [
      /^(.+) was exiled with (\d+) votes\.(?: Role: (.+)\.)?$/s,
      (_, name, n, role) =>
        `نُفي ${name} بعد حصوله على ${n} أصوات.${role ? ` الدور: ${dictionary[role] || role}.` : ""}`,
    ],
    [
      /^(.+) begins with one vote from a Provoker\.$/s,
      (_, name) => `يبدأ ${name} بصوت واحد من المحرّض.`,
    ],
    [
      /^(.+)’s haunting carried (.+) away\.$/s,
      (_, a, b) => `أودى انتقام ${a} بـ ${b}.`,
    ],
    [
      /^Day (\d+)\. The council is open\.$/,
      (_, n) => `اليوم ${n}. بدأ مجلس القرية.`,
    ],
    [
      /^Night (\d+)\. The village returns home\.$/,
      (_, n) => `الليلة ${n}. يعود السكان إلى منازلهم.`,
    ],
    [
      /^DAY (\d+)(.*)$/s,
      (_, n, rest) =>
        `اليوم ${n}${rest === " · NO EXILE" ? " · لا نفي" : rest}`,
    ],
    [/^NIGHT (\d+)$/, (_, n) => `الليلة ${n}`],
    [
      /^Day (\d+) · One resident, one vote$/,
      (_, n) => `اليوم ${n} · لكل ساكن صوت واحد`,
    ],
    [/^VOTE → (.+)$/s, (_, name) => `تصويت ← ${name}`],
    [/^(.+) claims the Hollow$/s, (_, name) => `يسيطر ${name} على القرية`],
    [/^(.+) · YOU$/s, (_, name) => `${name} · أنت`],
    [/^(.+) · your home$/s, (_, name) => `${name} · منزلك`],
    [/^(.+) · resident (\d+)$/s, (_, name, n) => `${name} · الساكن ${n}`],
    [
      /^(Select|Accuse|Defend) (.+?)(, eliminated)?$/s,
      (_, action, name, eliminated) =>
        `${{ Select: "اختر", Accuse: "اتّهم", Defend: "دافع عن" }[action]} ${name}${eliminated ? "، مستبعد" : ""}`,
    ],
    [
      /^(Trust|Uncertain|Suspicious|Dangerous): (.+)$/s,
      (_, rating, name) => `${dictionary[rating]}: ${name}`,
    ],
    [/^Share clue (\d+)$/, (_, n) => `شارك الدليل ${n}`],
    [
      /^Choose character color (#[a-f\d]+)$/i,
      (_, color) => `اختر لون الشخصية ${color}`,
    ],
    [/^Choose (#[a-f\d]+)$/i, (_, color) => `اختر ${color}`],
    [/^(\d+) NEIGHBORS READY$/, (_, n) => `${n} جيران جاهزون`],
    [
      /^I trust (.+)\. We need stronger evidence before voting\.$/s,
      (_, name) => `أثق بـ ${name}. نحتاج دليلًا أقوى قبل التصويت.`,
    ],
    [
      /^I suspect (.+)\. Can you explain your night action\?$/s,
      (_, name) => `أشتبه بـ ${name}. هل يمكنك شرح تصرفك الليلي؟`,
    ],
  ];

  function sourceOf(text) {
    return rendered.get(text) || reverse.get(text) || text;
  }

  function t(text) {
    if (typeof text !== "string" || !text) return text;
    if (userNames.has(text)) return text;
    const source = sourceOf(text);
    if (language === "en") return source;
    const match = source.match(/^(\s*)([\s\S]*?)(\s*)$/);
    const content = match[2];
    if (userNames.has(content)) return text;
    let result = dictionary[content];
    if (result === undefined) {
      for (const [pattern, translate] of patterns) {
        const groups = content.match(pattern);
        if (groups) {
          result = translate(...groups);
          break;
        }
      }
    }
    if (result === undefined) return source;
    result = match[1] + result + match[3];
    // Bound the reversible cache during long sessions without retaining DOM nodes.
    if (rendered.size > 2000) rendered.delete(rendered.keys().next().value);
    rendered.set(result, source);
    return result;
  }

  function excluded(element) {
    if (!element || element.nodeType !== 1) return false;
    if (
      element.closest(
        '[data-no-i18n], .name, .room-code, [data-room-code], script, style, svg, [contenteditable]:not([contenteditable="false"])',
      )
    )
      return true;
    const chat = element.closest(".chatline");
    if (chat) {
      if (!chat.matches(".system, .event, .death")) return true;
      if (element.closest("strong")) return true;
    }
    return false;
  }

  function translateValue(node, key, read, write) {
    const current = read();
    let state = sources.get(node);
    if (!state) {
      state = new Map();
      sources.set(node, state);
    }
    let record = state.get(key);
    if (!record || current !== record.output)
      record = { source: sourceOf(current), output: current };
    const next = t(record.source);
    record.output = next;
    state.set(key, record);
    if (next !== current) write(next);
  }

  function walk(node) {
    if (node.nodeType === 3) {
      if (
        !excluded(node.parentElement) &&
        !node.parentElement?.closest("textarea")
      )
        translateValue(
          node,
          "text",
          () => node.nodeValue,
          (value) => {
            node.nodeValue = value;
          },
        );
      return;
    }
    if (![1, 9, 11].includes(node.nodeType)) return;
    if (node.nodeType === 1) {
      if (excluded(node)) return;
      for (const attribute of ["title", "aria-label", "placeholder"]) {
        if (node.hasAttribute(attribute))
          translateValue(
            node,
            attribute,
            () => node.getAttribute(attribute),
            (value) => node.setAttribute(attribute, value),
          );
      }
      // The text of options with no explicit value IS their value in HTML.
      // Freeze that original value before translating the visible label.
      if (node.tagName === "OPTION" && !node.hasAttribute("value"))
        node.setAttribute("value", node.value);
      if (node.tagName === "INPUT" || node.tagName === "TEXTAREA") return;
    }
    for (const child of Array.from(node.childNodes || [])) walk(child);
  }

  function refresh(root) {
    root = root || (scope.document && scope.document.body);
    if (root) walk(root);
  }

  function refreshAll() {
    for (const root of roots.keys()) refresh(root);
  }

  function observe(root) {
    root = root || (scope.document && scope.document.body);
    if (!root) return null;
    if (roots.has(root)) return roots.get(root);
    const Observer = scope.MutationObserver;
    const observer = Observer
      ? new Observer((records) => {
          // Refresh just changed subtrees. Idempotent writes make the next callback inert.
          const pending = new Set();
          for (const record of records) {
            if (record.type === "childList") {
              for (const added of record.addedNodes) pending.add(added);
            } else pending.add(record.target);
          }
          for (const node of pending) refresh(node);
        })
      : null;
    roots.set(root, observer);
    if (observer)
      observer.observe(root, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ["title", "aria-label", "placeholder"],
      });
    refresh(root);
    return observer;
  }

  function updateDocument() {
    const doc = scope.document;
    if (!doc) return;
    doc.documentElement.lang = language;
    doc.documentElement.dir = language === "ar" ? "rtl" : "ltr";
    if (!doc.getElementById("lh-locale-style")) {
      const style = doc.createElement("style");
      style.id = "lh-locale-style";
      style.textContent = `
html[lang="ar"] body,html[lang="ar"] button,html[lang="ar"] input,html[lang="ar"] select,html[lang="ar"] textarea,html[lang="ar"] h1,html[lang="ar"] h2,html[lang="ar"] h3,html[lang="ar"] .serif{font-family:"Noto Sans Arabic","Noto Naskh Arabic",Tahoma,Arial,sans-serif!important;letter-spacing:0!important}
html[dir="rtl"] .resident{text-align:right}html[dir="rtl"] .modal .close{float:left}html[dir="rtl"] .clock{border-left:0;border-right:2px solid #ded3ae;padding-left:0;padding-right:11px;margin-left:0;margin-right:1px}html[dir="rtl"] .chathead .small{margin-left:0;margin-right:auto}html[dir="rtl"] .chatline .daytag{margin-right:0;margin-left:4px}
.name,[data-no-i18n],.chatline.chat{unicode-bidi:plaintext}.room-code,[data-room-code],#lh-roomcode,#lh-room-code,input[autocomplete="one-time-code"],#lh-timer{direction:ltr;unicode-bidi:isolate}
html[dir="rtl"] .role-gallery,html[dir="rtl"] .guidegrid,html[dir="rtl"] .rolechecks{direction:rtl}html[lang="ar"] .btn{white-space:normal;line-height:1.4}html[lang="ar"] .clue-detail,html[lang="ar"] .modal p{line-height:1.85}
@media(max-width:700px){html[dir="rtl"] .clock{padding-right:7px}html[lang="ar"] .phasebadge strong{font-size:12px}html[lang="ar"] .action-bar .btn{font-size:11px}}
`;
      (doc.head || doc.documentElement).appendChild(style);
    }
  }

  function setLanguage(next) {
    if (next !== "en" && next !== "ar") return language;
    language = next;
    try {
      if (scope.localStorage) scope.localStorage.setItem(storageKey, language);
    } catch (_) {
      /* Browser storage may be disabled. */
    }
    updateDocument();
    refreshAll();
    return language;
  }

  function setUserNames(names) {
    userNames = new Set(
      Array.from(names || []).filter((name) => typeof name === "string"),
    );
    refreshAll();
  }

  const api = {
    get language() {
      return language;
    },
    setLanguage,
    t,
    observe,
    refresh,
    setUserNames,
    register,
  };
  if (typeof module === "object" && module.exports) module.exports = api;
  scope.LanternLocale = api;
  try {
    if (scope.localStorage && scope.localStorage.getItem(storageKey) === "ar")
      language = "ar";
  } catch (_) {
    /* Continue in English. */
  }
  updateDocument();
})(typeof window !== "undefined" ? window : globalThis);
