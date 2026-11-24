# Zhol

Albanska kortspelet zhol online: spela med vänner via bordskod eller rankat mot främlingar på din nivå.

## Vad som finns (version 0.1)

- **Plattform för flera spel**: varje spel är en modul i `supabase/functions/_shared/games/` (regler) och `src/games/` (bordsvy). Ranking och topplista per spel.
- **Zhol** (`supabase/functions/_shared/games/zhol.ts`): Zhol i vogël (7 kort, 3+4) och Zhol i madh (2 lekar, 14 kort, grupper om minst 3), xhola, set och stegar (A låg eller hög, ingen K-A-2). Samma kod körs på servern och i appen. 15 tester.
- **Server** (`supabase/functions/game`): alla drag kontrolleras på servern. Ingen kan se andras kort eller fuska med en ändrad app.
- **Databas** (`supabase/migrations`): profiler med Elo, bord, spel, dolda händer (RLS) och Elo-historik.
- **Botar och större bord:** 2, 4, 6 eller 8 spelare. Vid fler än 4 spelare används en extra kortlek. "Spela mot botar" startar direkt, och snabbmatch fylls med botar efter 20 sekunder. Botspel är gratis och orankat, och botar syns aldrig i topplistan.
- **Tidsgräns:** 45 sekunder per tur. Går tiden ut spelar servern ett säkert drag åt spelaren. Två missade turer i rad, eller "Ge upp", räknas som förlust (även i Elo).
- **Låtsasmarker:** 1 000 marker vid start, 500 gratis per dag, bord med insats 0/100/500/1 000. Vinnaren tar potten, oavgjort ger tillbaka insatsen. Allt bokförs i `chip_ledger` och sköts av servern. Markerna har inget värde i pengar.
- **App** (`src/`): inloggning med e-postlänk eller som gäst, lobby, snabbmatch (rankad 1 mot 1, matchning inom ±250 Elo), privata bord för 2 eller 4 med kod, spelbord i realtid och topplista med ligor (Brons, Silver, Guld, Platina, Diamant).

## Kom igång

```bash
npm install
cp .env.example .env   # fyll i Supabase-URL och publik nyckel
npm test
npm run dev
```

### Supabase

1. Kör migrationen `supabase/migrations/20261124000000_init.sql`.
2. Driftsätt funktionen: `supabase functions deploy game`.
3. Under Authentication: slå på e-post (magic link). Slå på "Anonymous sign-ins" om gästläget ska fungera.
4. Lägg appens adress under Authentication → URL Configuration.

## Nästa steg

1. Turneringar: inköp, utslagsträd och priser (påbörjad databasdesign ligger utanför repot tills vidare).
2. Köp av marker (Stripe/App Store). Kräver juridisk kontroll först.
3. Albanska och engelska i appen och PWA (installera på mobilen).

## Lägga till ett nytt spel

1. Skriv reglerna som en modul i `supabase/functions/_shared/games/<spel>.ts` som uppfyller `GameModule` i `types.ts`.
2. Registrera den i `supabase/functions/_shared/games/index.ts`.
3. Gör bordsvyn i `src/games/<spel>/Board.tsx` och registrera den i `src/games/index.ts`.
4. Driftsätt funktionen `game` igen. Databasen behöver inte ändras.
