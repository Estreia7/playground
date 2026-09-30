import type { Lang } from "./i18n.ts";

/* The lines shown while a tournament is being drawn up.

   Twenty-five jokes per language, written once, with the players' names
   dropped into {a} {b} {c} at the moment they are shown. The jokes never
   change; only who they are about does, which is what makes the same 25 lines
   feel new every time a different group sits down to play.

   Two rules keep them safe to show to a room full of friends:

   - No article and no gendered word attaches to a name. Portuguese would
     normally write "o Rui" and "a Ana", which means guessing who is which.
     Every line here reads naturally as "{a}" on its own, and no adjective
     agrees with a name, so it is right whoever is in the group.
   - Every joke is about padel habits — excuses, warm-ups, the wall, the score
     — and never about a person's body, skill level or worth. A group should be
     able to laugh at the same line together.

   Placeholders are always filled with different players within one line. */

export const PHRASES: Record<Lang, readonly string[]> = {
  pt: [
    "A convencer {a} de que hoje não joga com {b} outra vez…",
    "A esconder de {a} os resultados anteriores, para ninguém chorar…",
    "A consultar o oráculo do padel sobre {a}…",
    "A garantir que {a} não escolhe sempre o campo com sombra…",
    "A medir o ego de {a} e de {b} antes do primeiro ponto…",
    "{a} jura que hoje está em grande forma. O sorteio tem dúvidas…",
    "A lançar a moeda ao ar. {a} pediu melhor de três…",
    "A separar {a} e {b}, que combinam bem demais…",
    "A ir buscar a bola que {a} mandou para o telhado…",
    "A preparar a desculpa de {a}: cotovelo, pulso ou sol nos olhos?…",
    "A ensinar {a} a contar até 24 sem se perder…",
    "A pôr {a} na dupla de {b}. Boa sorte aos dois…",
    "A confirmar que {a} trouxe a raquete certa desta vez…",
    "A treinar {a} para dizer «foi fora» com convicção…",
    "A afinar a tabela porque {a} já pediu revanche…",
    "A avisar {a} que «estava só a aquecer» não conta como ponto…",
    "A aquecer {a} e {b}. Os joelhos já fazem barulho…",
    "A verificar se {a} e {b} sabem mesmo quem serve primeiro…",
    "A guardar um bom lugar no banco para quem perder com {a}…",
    "A tirar à sorte quem leva a água: {a}, {b} ou {c}…",
    "A dividir o campo: {a} fica com a direita, {b} com a culpa…",
    "A pedir a {a} que pare de alongar e venha jogar…",
    "A sortear as duplas. {a} já está a pedir um par melhor…",
    "A lembrar {a} que a parede é para usar. Não é decoração…",
    "A encher o frasco das desculpas: {a}, {b} e {c} já reservaram lugar…",
  ],
  en: [
    "Convincing {a} they won't be paired with {b} again…",
    "Hiding old scores from {a} so nobody cries…",
    "Consulting the padel oracle about {a}…",
    "Making sure {a} doesn't always pick the shady court…",
    "Measuring the egos of {a} and {b} before the first point…",
    "{a} swears they're in top form. The draw has doubts…",
    "Flipping a coin. {a} asked for best of three…",
    "Splitting up {a} and {b}, who work far too well together…",
    "Fetching the ball {a} sent onto the roof…",
    "Preparing {a}'s excuse: elbow, wrist or sun in the eyes?…",
    "Teaching {a} to count to 24 without losing track…",
    "Putting {a} on {b}'s team. Good luck to both…",
    "Checking {a} brought the right racket this time…",
    "Training {a} to say 'that was out' with conviction…",
    "Tuning the table because {a} has already asked for a rematch…",
    "Warning {a} that 'I was just warming up' doesn't count as a point…",
    "Warming up {a} and {b}. The knees are already making noise…",
    "Checking {a} and {b} really know who serves first…",
    "Saving a good spot on the bench for whoever loses to {a}…",
    "Drawing lots for who brings the water: {a}, {b} or {c}…",
    "Splitting the court: {a} takes the right side, {b} takes the blame…",
    "Asking {a} to stop stretching and come and play…",
    "Drawing the pairs. {a} is already asking for a better partner…",
    "Reminding {a} the wall is there to be used. It's not decoration…",
    "Filling the excuse jar: {a}, {b} and {c} have already booked seats…",
  ],
};

/** The placeholders a line uses, in the order they first appear. */
export function slotsIn(template: string): string[] {
  const found: string[] = [];
  for (const m of template.matchAll(/\{([a-z])\}/g)) {
    if (!found.includes(m[1])) found.push(m[1]);
  }
  return found;
}

/** Drop names into a line. Each distinct slot gets its own name, taken in
    order from `names`, so one joke never names the same person twice.

    With fewer names than slots the list wraps rather than failing. That cannot
    happen with a real tournament, which needs at least four players, but a
    loading screen is the wrong place for an exception. */
export function fillPhrase(template: string, names: readonly string[]): string {
  const slots = slotsIn(template);
  const pool = names.filter((n) => n.trim().length > 0);
  if (pool.length === 0) return template.replace(/\{[a-z]\}/g, "…");

  const chosen = new Map<string, string>();
  slots.forEach((slot, i) => chosen.set(slot, pool[i % pool.length].trim()));
  return template.replace(/\{([a-z])\}/g, (_, slot: string) => chosen.get(slot) ?? "");
}

function shuffled<T>(items: readonly T[], rng: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** `count` different jokes with the group's names filled in.

    The lines are drawn without repeats. Names come off a shuffled queue, so a
    run of jokes spreads across the whole group instead of picking on whoever
    the random generator happened to like; when the queue runs dry it is
    reshuffled. Inside one joke every name is different. */
export function pickPhrases(
  lang: Lang,
  names: readonly string[],
  count: number,
  rng: () => number = Math.random,
): string[] {
  const pool = PHRASES[lang];
  const lines = shuffled(pool, rng).slice(0, Math.min(count, pool.length));

  const clean = [...new Set(names.map((n) => n.trim()).filter((n) => n.length > 0))];
  let queue = shuffled(clean, rng);

  const out: string[] = [];
  for (const line of lines) {
    const needed = slotsIn(line).length;
    const picked: string[] = [];

    // Take the next names that are not already in this joke, refilling the
    // queue if it empties. The guard stops a group smaller than the joke from
    // looping forever; fillPhrase wraps in that case.
    let refills = 0;
    while (picked.length < needed && refills <= 3) {
      const at = queue.findIndex((n) => !picked.includes(n));
      if (at === -1) {
        queue = shuffled(clean, rng);
        refills++;
        continue;
      }
      picked.push(queue.splice(at, 1)[0]);
    }
    out.push(fillPhrase(line, picked.length ? picked : clean));
  }
  return out;
}
