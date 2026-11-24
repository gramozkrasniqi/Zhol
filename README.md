# Zhol

Albanska kortspelet zhol online: spela med vänner via bordskod eller rankat mot främlingar på din nivå.

## Vad som finns (version 0.1)

- **Spelmotor** (`supabase/functions/_shared/engine.ts`): Zhol i vogël (7 kort, 3+4) och Zhol i madh (2 lekar, 14 kort, grupper om minst 3), xhola, set och stegar (A låg eller hög, ingen K-A-2). Samma kod körs på servern och i appen. 15 tester.
- **Server** (`supabase/functions/game`): alla drag kontrolleras på servern. Ingen kan se andras kort eller fuska med en ändrad app.
- **Databas** (`supabase/migrations`): profiler med Elo, bord, spel, dolda händer (RLS) och Elo-historik.
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

1. Tidsgräns per drag och automatisk förlust vid avhopp (krävs för rankade matcher).
2. Låtsasmarker: saldo, insatsbord, dagliga gratismarker.
3. Turneringar: inköp, utslagsträd och priser.
4. Köp av marker (Stripe/App Store). Kräver juridisk kontroll först.
5. Albanska och engelska i appen och PWA (installera på mobilen).
