// Languages: Swedish (the source text) and Albanian.
// t("Svensk text", { name }) returns the text in the chosen language; {name} is filled in.
// A text without an Albanian line simply stays in Swedish, so nothing ever goes blank.

export type Lang = "sv" | "sq";
const KEY = "zhol.lang";

function initial(): Lang {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "sv" || saved === "sq") return saved;
  } catch { /* private mode */ }
  const nav = typeof navigator !== "undefined" ? navigator.languages ?? [navigator.language] : [];
  return nav.some((l) => l?.toLowerCase().startsWith("sq")) ? "sq" : "sv";
}

export const lang: Lang = initial();
if (typeof document !== "undefined") document.documentElement.lang = lang;

/** Switches language. The page reloads, so every text is redrawn in the new language. */
export function setLang(l: Lang) {
  if (l === lang) return;
  try { localStorage.setItem(KEY, l); } catch { /* private mode */ }
  location.reload();
}

export function t(sv: string, vars?: Record<string, string | number>): string {
  let s = lang === "sq" ? SQ[sv] ?? sv : sv;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Messages from the server arrive in Swedish; some carry a number. */
export function tServer(msg: string): string {
  if (lang === "sv") return msg;
  if (SQ[msg]) return SQ[msg];
  for (const [re, out] of SERVER_PATTERNS) {
    const m = msg.match(re);
    if (m) return out.replace(/\$(\d)/g, (_, i) => m[Number(i)]);
  }
  return msg;
}
const SERVER_PATTERNS: [RegExp, string][] = [
  [/^Antal spelare: (.+)$/, "Numri i lojtarëve: $1"],
  [/^Insatsen är (\d+) Lek – du har inte tillräckligt$/, "Hyrja është $1 Lek – nuk ke mjaftueshëm"],
  [/^Någon vid bordet har inte (\d+) Lek$/, "Dikush në tryezë nuk ka $1 Lek"],
  [/^Du behöver (\d+) Lek för att köpa in dig igen$/, "Të duhen $1 Lek për t'u rifutur në lojë"],
];

/** For the tests: is there an Albanian line for this text? */
export const hasAlbanian = (sv: string) => sv in SQ;

const SQ: Record<string, string> = {
  /* ---------- Login ---------- */
  "Loja shqiptare me letra. Spela med vänner, mot folk på din nivå eller mot botar – när som helst.":
    "Loja shqiptare me letra. Luaj me shokët, me lojtarë të nivelit tënd ose kundër robotëve – kurdo që të duash.",
  "Kolla din e-post. Inloggningslänken är skickad till": "Shiko email-in. Lidhja për hyrje u dërgua te",
  "Spela direkt som gäst": "Luaj menjëherë si mysafir",
  "eller spara ditt konto": "ose ruaje llogarinë tënde",
  "E-post": "Email",
  "du@exempel.se": "ti@shembull.com",
  "Skicka inloggningslänk": "Dërgo lidhjen për hyrje",
  "Gästinloggning är inte påslagen. Logga in med e-post i stället.": "Hyrja si mysafir nuk është e aktivizuar. Hyr me email.",
  "Språk": "Gjuha",

  /* ---------- Lobby ---------- */
  "Dina Lek": "Lekët e tu",
  "Profil och avatar": "Profili dhe avatari",
  "Din avatar": "Avatari yt",
  "Välj avatar": "Zgjidh avatarin",
  "Laddar upp…": "Po ngarkohet…",
  "Ladda upp egen bild": "Ngarko foton tënde",
  "Din dryck vid bordet": "Pija jote në tryezë",
  "Välj dryck": "Zgjidh pijen",
  "Kafe turke": "Kafe turke",
  "Çaj": "Çaj",
  "Ditt namn vid bordet": "Emri yt në tryezë",
  "Spara namn": "Ruaje emrin",
  "Logga ut": "Dil",
  "Avataren kunde inte sparas": "Avatari nuk u ruajt",
  "Drycken kunde inte sparas": "Pija nuk u ruajt",
  "Bilden kunde inte laddas upp": "Fotoja nuk u ngarkua",
  "Bilden kunde inte läsas": "Fotoja nuk u lexua",
  "Sätt dig vid bordet.": "Ulu në tryezë.",
  "vinster av {n}": "fitore nga {n}",
  "en motståndare": "një kundërshtar",
  "{n} motståndare": "{n} kundërshtarë",
  "Söker {who} nära {elo} Elo. Botar tar platserna om {s} sekunder.":
    "Po kërkojmë {who} rreth {elo} Elo. Robotët zënë vendet pas {s} sekondash.",
  "Spela mot botar nu": "Luaj kundër robotëve tani",
  "Avbryt": "Anulo",
  "Snabbmatch": "Ndeshje e shpejtë",
  "Mot botar": "Kundër robotëve",
  "Snabbmatch är rankad och ger Elo. Mot botar är gratis och orankat.":
    "Ndeshja e shpejtë është e renditur dhe jep Elo. Kundër robotëve është falas dhe pa renditje.",
  "Ny på Zhol?": "I ri në Zhol?",
  "Lär dig spela på två minuter": "Mëso të luash për dy minuta",
  "Regler": "Rregullat",
  "Öva en runda": "Provo një raund",
  "Hämta dagens {n} gratis Lek": "Merr {n} Lek falas për sot",
  "Ditt bord": "Tryeza jote",
  "Spel": "Loja",
  "Variant": "Varianti",
  "Spelsätt": "Mënyra e lojës",
  "Snabb": "E shpejtë",
  "En runda, den som gör Zhol vinner": "Një raund, fiton kush bën Zhol",
  "Till 101": "Deri në 101",
  "Poäng för lösa kort, sista kvar tar potten": "Pikë për letrat e lira, i fundit që mbetet merr potin",
  "Spelare": "Lojtarë",
  "Antal spelare": "Numri i lojtarëve",
  "Insats per spelare": "Hyrja për lojtar",
  "Gratis": "Falas",
  "Gratis bord.": "Tryezë falas.",
  "Pott {n} Lek.": "Poti {n} Lek.",
  "Sista kvar tar allt. Den som köper in sig igen betalar insatsen en gång till.":
    "I fundit që mbetet merr gjithçka. Kush rifutet në lojë e paguan hyrjen edhe një herë.",
  "Vinnaren tar allt.": "Fituesi merr gjithçka.",
  "Spela med vänner": "Luaj me shokët",
  "Skapa ett privat bord för {n} och dela koden. Tomma platser kan fyllas med botar.":
    "Krijo një tryezë private për {n} dhe ndaj kodin. Vendet bosh mund të plotësohen me robotë.",
  "Skapa privat bord": "Krijo tryezë private",
  "Har du fått en kod?": "Ke marrë një kod?",
  "Bordskod": "Kodi i tryezës",
  "Gå med i bordet": "Hyr në tryezë",
  "Bästa spelarna i {g}": "Lojtarët më të mirë në {g}",
  "Plats": "Vendi",
  "Liga": "Liga",
  "Ingen har spelat en rankad match än. Vinn en snabbmatch så hamnar du först här.":
    "Askush nuk ka luajtur ende një ndeshje të renditur. Fito një ndeshje të shpejtë dhe del i pari këtu.",
  "Lek i Zhol är spelpengar, inte riktiga albanska lek. De har inget värde och kan inte växlas in eller föras över.":
    "Lekët në Zhol janë para loje, jo lekë të vërteta shqiptare. Nuk kanë vlerë dhe nuk mund të këmbehen as të transferohen.",
  "Brons": "Bronz", "Silver": "Argjend", "Guld": "Ar", "Platina": "Platin", "Diamant": "Diamant",
  "Spader": "Maç", "Hjärter": "Kupë", "Ruter": "Karo", "Klöver": "Spathi", "Stjärna": "Yll", "Krona": "Kurorë",
  "Springare": "Kalë", "Sol": "Diell", "Måne": "Hënë", "Blomma": "Lule", "Gnista": "Shkëndijë", "Ankare": "Spirancë",

  /* Variants */
  "Zhol i vogël": "Zhol i vogël",
  "Zhol i madh": "Zhol i madh",
  "7 kort": "7 letra",
  "10 kort": "10 letra",
  "till 101": "deri në 101",

  /* ---------- Table ---------- */
  "Rankad match": "Ndeshje e renditur",
  "Privat bord": "Tryezë private",
  "{kind} i {game}": "{kind} në {game}",
  ", insats {s} Lek, pott {p} Lek": ", hyrja {s} Lek, poti {p} Lek",
  "Skicka koden till dina vänner:": "Dërgoju kodin shokëve:",
  "{n} av {m} spelare: {names}": "{n} nga {m} lojtarë: {names}",
  "Väntar på spelare…": "Po presim lojtarët…",
  "Fyll lediga platser med botar": "Plotëso vendet bosh me robotë",
  "Lämna bordet": "Largohu nga tryeza",
  "Helskärm": "Ekran i plotë",
  "← Lobby": "← Lobi",
  "Rankad": "E renditur",
  "Bord {c}": "Tryeza {c}",
  "Runda {n}": "Raundi {n}",
  "Pott {n} Lek": "Poti {n} Lek",
  "Ja, ge upp": "Po, dorëzohem",
  "Ge upp": "Dorëzohu",
  "{name} gav upp.": "{name} u dorëzua.",
  "{name} missade två turer i rad och förlorar.": "{name} humbi dy radhë rresht dhe humb lojën.",
  "{name} vinner.": "{name} fiton.",
  "Ny runda": "Raund i ri",
  "Vrid telefonen för ett större bord": "Ktheje telefonin për një tryezë më të madhe",
  "Den här appversionen kan inte visa spelet. Ladda om sidan.": "Ky version i aplikacionit nuk e shfaq dot lojën. Rifresko faqen.",
  "Du": "Ti",
  "spader": "maç", "hjärter": "kupë", "ruter": "karo", "klöver": "spathi",
  "bot": "robot",

  /* Chat */
  "Lycka till!": "Paç fat!", "Bra spelat": "Lojë e mirë", "Oj!": "Oh!", "Snyggt!": "Bukur!", "Så nära!": "Aq afër!", "Tack för spelet": "Faleminderit për lojën",
  "Chatt": "Biseda",
  "{n} olästa": "{n} të palexuara",
  "Chatt vid bordet": "Biseda në tryezë",
  "Stäng chatten": "Mbyll bisedën",
  "Stäng": "Mbyll",
  "Inga meddelanden än. Säg hej till bordet.": "Ende asnjë mesazh. Përshëndete tryezën.",
  "Har lämnat bordet": "Është larguar nga tryeza",
  "Skriv ett meddelande": "Shkruaj një mesazh",
  "Skriv till bordet…": "Shkruaji tryezës…",
  "Skicka": "Dërgo",
  "Du skriver för snabbt – vänta en stund.": "Po shkruan shumë shpejt – prit pak.",
  "Meddelandet kunde inte skickas.": "Mesazhi nuk u dërgua.",

  /* ---------- Board ---------- */
  "Grupper": "Grupe", "Nummer": "Numri", "Färg": "Ngjyra",
  "Nybörjare": "Fillestar", "Van": "I sprovuar", "Expert": "Ekspert",
  "Partiet är slut.": "Partia mbaroi.",
  "Högen tog slut – oavgjort.": "Tallonat mbaruan – barazim.",
  "Zhol! Du vann.": "Zhol! Fitove.",
  "{name} gjorde Zhol.": "{name} bëri Zhol.",
  "Runda {n} är klar.": "Raundi {n} mbaroi.",
  "Du är ute – {name} spelar…": "Ti je jashtë – po luan {name}…",
  "Din tur – ta ett kort": "Radha jote – merr një letër",
  "Du har Zhol!": "Ke Zhol!",
  "Kasta ett kort": "Hidh një letër",
  "{name} spelar…": "Po luan {name}…",
  "Högen, {n} kort": "Tallonat, {n} letra",
  "Högen": "Tallonat",
  "Kasthögen": "Letrat e hedhura",
  "Kastat": "E hedhur",
  "Zhol!": "Zhol!",
  "Runda {n} · till 101": "Raundi {n} · deri në 101",
  "{n} p": "{n} p",
  "ute": "jashtë",
  "{n} kort": "{n} letra",
  "{n} Elo": "{n} Elo",
  "Inga färdiga grupper än": "Ende asnjë grup i gatshëm",
  "{a} av {b} kort i färdiga grupper": "{a} nga {b} letra në grupe të gatshme",
  "Sortera handen, nu: {k}": "Rendit dorën, tani: {k}",
  "egen ordning": "renditja jote",
  "Sortera": "Rendit",
  "Stäng av ljud": "Fik zërin",
  "Sätt på ljud": "Ndiz zërin",
  "Ta ett kort från högen eller kasthögen.": "Merr një letër nga tallonat ose nga letrat e hedhura.",
  "Handen går ihop – tryck på Zhol!": "Dora mbyllet – shtyp Zhol!",
  "Dra ett kort till kasthögen, eller tryck två gånger på det.": "Tërhiq një letër te letrat e hedhura, ose shtype dy herë.",
  "Dra korten i handen för att ordna dem.": "Tërhiqi letrat në dorë për t'i renditur.",

  /* Round board (101) */
  "Ställningen efter runda {n}": "Renditja pas raundit {n}",
  "Högen tog slut – ingen fick poäng.": "Tallonat mbaruan – askush nuk mori pikë.",
  "{name} stängde.": "{name} e mbylli.",
  "Den som når {n} åker ut.": "Kush arrin {n} del jashtë.",
  "köpt in {n}×": "rifutur {n}×",
  "{n} lösa kort": "{n} letra të lira",
  "Köp in dig igen på {n} poäng": "Rifutu në lojë me {n} pikë",
  "kostar insatsen igen": "kushton sërish hyrjen",
  "Nästa runda": "Raundi tjetër",
  "Nästa runda delas ut om {n} s.": "Raundi tjetër shpërndahet pas {n} s.",

  /* Finale */
  "Rundan är slut": "Raundi mbaroi",
  "Oavgjort": "Barazim",
  "Du är sist kvar – du vann!": "Mbete i fundit – fitove!",
  "{name} är sist kvar och vinner": "{name} mbeti i fundit dhe fiton",
  "Zhol! Du vann": "Zhol! Fitove",
  "{name} gjorde Zhol": "{name} bëri Zhol",
  "Högen tog slut innan någon fick ihop handen.": "Tallonat mbaruan para se dikush ta mbyllte dorën.",
  "{name} tar {n} Lek": "{name} merr {n} Lek",
  "Till lobbyn": "Te lobi",

  /* ---------- Rules ---------- */
  "Så spelar du Zhol": "Si luhet Zhol",
  "Zhol är ett albanskt kortspel för 2–8 spelare. Den som först får alla sina kort i grupper och ropar <b>Zhol!</b> vinner rundan.":
    "Zhol është një lojë shqiptare me letra për 2–8 lojtarë. Kush i vendos i pari të gjitha letrat në grupe dhe thërret <b>Zhol!</b> e fiton raundin.",
  "<b>Lika:</b> 3 eller 4 kort med samma valör, alla i olika färger.":
    "<b>Njësoj:</b> 3 ose 4 letra me të njëjtën vlerë, të gjitha me simbole të ndryshme.",
  "<b>Serie:</b> 3 eller fler kort i följd, i samma färg.": "<b>Me radhë:</b> 3 ose më shumë letra radhazi, me të njëjtin simbol.",
  "<b>Xhol</b> (jokern) kan ersätta vilket kort som helst.": "<b>Xholi</b> mund të zëvendësojë çdo letër.",
  "<b>Ess</b> kan vara lågt (A-2-3) eller högt (Q-K-A), men inte båda samtidigt.":
    "<b>Asi</b> mund të jetë i ulët (A-2-3) ose i lartë (Q-K-A), por jo të dyja njëherësh.",
  "En tur": "Një radhë",
  "<b>Ta ett kort</b>, från högen eller det översta kortet i kasthögen.": "<b>Merr një letër</b>, nga tallonat ose letrën e sipërme të letrave të hedhura.",
  "<b>Kasta ett kort</b> på kasthögen. Kortet du nyss tog från kasthögen får du inte kasta direkt.":
    "<b>Hidh një letër</b>. Letrën që sapo more nga letrat e hedhura nuk mund ta hedhësh menjëherë.",
  "Går alla kort ihop efter att du tagit ett kort trycker du <b>Zhol!</b> och vinner.":
    "Nëse të gjitha letrat mbyllen pasi merr një letër, shtyp <b>Zhol!</b> dhe fiton.",
  "Två varianter": "Dy variante",
  "<b>Zhol i vogël</b> (lilla): 7 kort, alltid en grupp med 3 och en med 4. <b>Zhol i madh</b> (stora): 10 kort (11 under din tur) och två kortlekar. Alla kort ska ligga i grupper om minst 3. Vid fler än 4 spelare läggs en kortlek till.":
    "<b>Zhol i vogël</b>: 7 letra, gjithmonë një grup me 3 dhe një me 4. <b>Zhol i madh</b>: 10 letra (11 gjatë radhës tënde) dhe dy pako. Të gjitha letrat duhet të jenë në grupe me së paku 3. Me më shumë se 4 lojtarë shtohet një pako.",
  "Till 101 (poäng)": "Deri në 101 (me pikë)",
  "När någon gör Zhol får de andra poäng för korten som inte ligger i en grupp: 2–10 som skrivet, ess och klädda kort 10, xhol 20. Den som stänger får −20 (−40 med en xhol som sista kort). Den som når 101 åker ut, och den som är sist kvar tar potten. Den som är ute kan köpa in sig igen och får då samma poäng som den som har högst.":
    "Kur dikush bën Zhol, të tjerët marrin pikë për letrat që nuk janë në grup: 2–10 sa vlera, asi dhe figurat 10, xholi 20. Kush e mbyll merr −20 (−40 me xhol si letër të fundit). Kush arrin 101 del jashtë, dhe i fundit që mbetet merr potin. Kush është jashtë mund të rifutet dhe merr pikët e atij që ka më shumë.",
  "Tid, Elo och Lek": "Koha, Elo dhe Lekët",
  "Du har 45 sekunder per tur. Missar du två turer i rad förlorar du rundan. Snabbmatcher är rankade och ger Elo. Lek är låtsasmarker utan värde i pengar.":
    "Ke 45 sekonda për radhë. Nëse humb dy radhë rresht, e humb raundin. Ndeshjet e shpejta janë të renditura dhe japin Elo. Lekët janë fisha loje pa vlerë në para.",

  /* ---------- Tutorial ---------- */
  "Lär dig spela": "Mëso të luash",
  "Zhol i vogël, 7 kort": "Zhol i vogël, 7 letra",
  "Börja om": "Fillo nga e para",
  "Zhol på två minuter": "Zhol për dy minuta",
  "<b>Målet:</b> få alla dina 7 kort i grupper.": "<b>Qëllimi:</b> vendosi të 7 letrat në grupe.",
  "<b>Grupper:</b> tre eller fyra lika (Q♠ Q♦ Q♣) eller en serie i samma färg (5♥ 6♥ 7♥).":
    "<b>Grupet:</b> tre ose katër njësoj (Q♠ Q♦ Q♣) ose me radhë me të njëjtin simbol (5♥ 6♥ 7♥).",
  "<b>Varje tur:</b> ta ett kort, kasta ett kort.": "<b>Çdo radhë:</b> merr një letër, hidh një letër.",
  "<b>Vinst:</b> när allt går ihop trycker du Zhol!": "<b>Fitorja:</b> kur gjithçka mbyllet, shtyp Zhol!",
  "Du spelar en övningsrunda mot Drita. Inget räknas och inga Lek står på spel.":
    "Luan një raund prove kundër Dritës. Asgjë nuk numërohet dhe nuk vihen Lekë në lojë.",
  "Börja": "Fillo",
  "Så går det till. Nu är du redo för riktiga bord.": "Kështu luhet. Tani je gati për tryeza të vërteta.",
  "Drita hann före den här gången. Försök igen!": "Drita ia doli e para këtë herë. Provo sërish!",
  "Nu är det Dritas tur. Titta på vad hon kastar – det kan vara ett kort du behöver.":
    "Tani është radha e Dritës. Shiko çfarë hedh – mund të jetë një letër që të duhet.",
  "Alla dina kort sitter nu i grupper. Tryck på Zhol! för att vinna.": "Të gjitha letrat e tua janë tani në grupe. Shtyp Zhol! për të fituar.",
  "Drita kastade 8♥. Den passar efter din 5♥ 6♥ 7♥. Tryck på kasthögen för att ta den.":
    "Drita hodhi 8♥. Përshtatet pas 5♥ 6♥ 7♥ tënde. Shtyp letrat e hedhura për ta marrë.",
  "Din tur börjar alltid med att du tar ett kort. Tryck på högen.": "Radha jote fillon gjithmonë duke marrë një letër. Shtyp tallonat.",
  "Ta ett kort – från högen, eller från kasthögen om det öppna kortet passar dig.":
    "Merr një letër – nga tallonat, ose nga letrat e hedhura nëse letra e hapur të shërben.",
  "Damerna blev en färdig grupp – se guldramen. Nu kastar du ett kort du inte behöver, till exempel {cards}: dra det till kasthögen eller tryck två gånger på det.":
    "Çupat u bënë grup i gatshëm – shiko kornizën e artë. Tani hidh një letër që nuk të duhet, për shembull {cards}: tërhiqe te letrat e hedhura ose shtype dy herë.",
  " eller ": " ose ",
  "Kasta ett kort du inte behöver. Behåll korten med guldram.": "Hidh një letër që nuk të duhet. Mbaji letrat me kornizë të artë.",

  /* ---------- Server and game messages ---------- */
  "Något gick fel": "Diçka shkoi keq",
  "Inte inloggad": "Nuk je i kyçur",
  "Okänd åtgärd": "Veprim i panjohur",
  "Någon hann före – försök igen": "Dikush ia doli më parë – provo sërish",
  "Serverfel": "Gabim në server",
  "Okänt spel": "Lojë e panjohur",
  "3–20 tecken: bokstäver, siffror, _ . -": "3–20 shenja: shkronja, numra, _ . -",
  "Namnet är upptaget": "Emri është i zënë",
  "Ogiltig insats": "Hyrje e pavlefshme",
  "Du har inte tillräckligt med Lek": "Nuk ke mjaftueshëm Lek",
  "Ogiltig variant": "Variant i pavlefshëm",
  "Bordet har redan börjat": "Tryeza ka filluar tashmë",
  "Bordet är fullt": "Tryeza është plot",
  "Platsen togs precis – försök igen": "Vendin e zuri dikush tani – provo sërish",
  "Hittar inget bord med den koden": "Nuk gjendet asnjë tryezë me këtë kod",
  "Ogiltigt antal spelare": "Numër i pavlefshëm lojtarësh",
  "Spelet pågår – spela klart först": "Loja vazhdon – mbaroje lojën më parë",
  "Kunde inte skapa bot": "Roboti nuk u krijua",
  "Du sitter inte vid bordet": "Nuk je ulur në këtë tryezë",
  "Någon har lämnat bordet": "Dikush është larguar nga tryeza",
  "Du är inte med i det här spelet": "Nuk je pjesë e kësaj loje",
  "Partiet är slut": "Partia mbaroi",
  "Tiden är inte slut än": "Koha nuk ka mbaruar ende",
  "2–8 spelare": "2–8 lojtarë",
  "Spelet är slut": "Loja mbaroi",
  "Rundan pågår": "Raundi vazhdon",
  "Inte din tur": "Nuk është radha jote",
  "Du har redan tagit ett kort": "E ke marrë tashmë një letër",
  "Kasthögen är tom": "Letrat e hedhura janë bosh",
  "Ta ett kort först": "Merr një letër më parë",
  "Kortet du just tog får inte kastas direkt": "Letrën që sapo more nuk mund ta hedhësh menjëherë",
  "Kortet finns inte i din hand": "Letra nuk është në dorën tënde",
  "Handen går inte ihop än": "Dora nuk mbyllet ende",
  "Okänt drag": "Lëvizje e panjohur",
  "Du är redan med": "Je tashmë në lojë",
  "Du har lämnat partiet": "Je larguar nga partia",
  "Du är ute – köp in dig igen eller titta på": "Je jashtë – rifutu në lojë ose shiko",
  "Väntar på nästa runda": "Po presim raundin tjetër",
};
