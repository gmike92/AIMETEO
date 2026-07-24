// Privacy policy essenziale per la beta chiusa (waitlist + notifiche push).
// NOTA legale: bozza operativa da far rivedere a un professionista prima
// del lancio pubblico — per la beta con tester informati copre l'essenziale.
export const metadata = {
  title: "Privacy | Zerotermico",
  description: "Come trattiamo i tuoi dati: waitlist, notifiche push, nessuna profilazione.",
};

export default function Privacy() {
  return (
    <div>
      <span className="eyebrow">trasparenza</span>
      <h1>Privacy, in <em>breve</em>.</h1>
      <p className="sub">
        Versione beta. Raccogliamo il minimo indispensabile e non vendiamo
        né cediamo dati a terzi.
      </p>

      <div className="panel">
        <strong>Cosa raccogliamo e perché</strong>
        <p className="note">
          <strong>Email (waitlist):</strong> solo se ce la lasci tu, per avvisarti
          delle novità dell'app. Base giuridica: consenso. Puoi chiederne la
          cancellazione in qualsiasi momento.
        </p>
        <p className="note">
          <strong>Subscription push:</strong> solo se attivi le notifiche, il tuo
          browser genera un identificativo tecnico che usiamo esclusivamente per
          inviarti gli avvisi che hai richiesto. Si revoca disattivando le
          notifiche dal browser.
        </p>
        <p className="note">
          <strong>Cosa NON facciamo:</strong> nessuna profilazione, nessuna
          pubblicità, nessuna vendita di dati, nessun tracciamento della tua
          posizione (le ricerche di località restano sul momento e non vengono
          associate a te).
        </p>
      </div>

      <div className="panel">
        <strong>Titolare e diritti</strong>
        <p className="note">
          Titolare del trattamento: Michele Guizzardi (progetto Zerotermico/Zerotermico,
          in fase beta) — contatto: michele.guizzardi@gmail.com. Hai diritto ad
          accesso, rettifica, cancellazione e portabilità dei tuoi dati (art. 15-20
          GDPR): scrivici e provvediamo.
        </p>
        <p className="note">
          I dati sono conservati su infrastruttura nell'Unione Europea o con
          garanzie equivalenti. Fornitori tecnici: vedi <a href="/fonti"
          style={{ textDecoration: "underline" }}>Fonti e licenze</a>.
        </p>
      </div>

      <p className="disclaimer">
        Ultimo aggiornamento: luglio 2026 · Questa informativa sarà estesa prima
        del lancio pubblico.
      </p>
    </div>
  );
}
