export const metadata = {
  title: "Condiciones del Servicio — Atlas",
}

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Condiciones del Servicio de Atlas</h1>
        <p className="text-sm text-muted-foreground mb-12">Última actualización: 13 de junio de 2026</p>

        <div className="space-y-10">
          <p className="text-muted-foreground leading-relaxed">
            Estas Condiciones del Servicio ("Condiciones") regulan el acceso y uso de Atlas
            ("Atlas", "la Plataforma", "nosotros"), una plataforma de automatización y gestión de
            mensajería de WhatsApp Business operada por ebooksdgg. Al utilizar Atlas, aceptás estas
            Condiciones en su totalidad.
          </p>

          <Section title="1. Aceptación de las Condiciones">
            <p>
              El uso de Atlas implica la aceptación de estas Condiciones. Si no estás de acuerdo
              con ellas, no debés utilizar la Plataforma.
            </p>
          </Section>

          <Section title="2. Descripción del servicio">
            <p>
              Atlas permite a los usuarios conectar cuentas de WhatsApp Business, centralizar y
              administrar conversaciones, y configurar flujos de automatización de mensajería. La
              Plataforma se integra con la API de WhatsApp Business de Meta para prestar estas
              funciones.
            </p>
          </Section>

          <Section title="3. Cuentas y elegibilidad">
            <p>
              Para utilizar Atlas, el usuario debe tener la autoridad necesaria para conectar y
              administrar las cuentas de WhatsApp Business que integra. El usuario es responsable
              de mantener la confidencialidad de sus credenciales de acceso y de toda la actividad
              realizada bajo su cuenta.
            </p>
          </Section>

          <Section title="4. Uso aceptable">
            <p>El usuario se compromete a:</p>
            <ul>
              <li>
                Utilizar la Plataforma conforme a las Condiciones de la Plataforma de Meta, las
                Políticas de WhatsApp Business y la Política de Mensajería de WhatsApp.
              </li>
              <li>
                No enviar mensajes no solicitados (spam), contenido engañoso, fraudulento, ilegal
                o que infrinja derechos de terceros.
              </li>
              <li>
                Obtener el consentimiento adecuado de las personas a las que envía mensajes, cuando
                la normativa lo requiera.
              </li>
              <li>
                No utilizar la Plataforma para fines ilícitos ni para vulnerar la seguridad de
                sistemas de terceros.
              </li>
            </ul>
            <p>
              El incumplimiento de estas obligaciones puede derivar en la suspensión o terminación
              del acceso.
            </p>
          </Section>

          <Section title="5. Responsabilidades del usuario">
            <p>
              El usuario es el único responsable del contenido que envía a través de la Plataforma
              y del cumplimiento de las leyes aplicables y de las políticas de Meta y WhatsApp.
              Atlas no se hace responsable por el uso indebido que el usuario haga del servicio.
            </p>
          </Section>

          <Section title="6. Propiedad intelectual">
            <p>
              Atlas y sus componentes son propiedad de ebooksdgg o de sus licenciantes. Estas
              Condiciones no transfieren ningún derecho de propiedad intelectual sobre la
              Plataforma al usuario.
            </p>
          </Section>

          <Section title="7. Disponibilidad del servicio">
            <p>
              Procuramos mantener la Plataforma operativa, pero no garantizamos disponibilidad
              ininterrumpida. Podemos realizar tareas de mantenimiento, actualizaciones o
              modificaciones que afecten temporalmente el servicio.
            </p>
          </Section>

          <Section title="8. Limitación de responsabilidad">
            <p>
              En la máxima medida permitida por la ley, Atlas no será responsable por daños
              indirectos, incidentales o consecuentes derivados del uso o la imposibilidad de uso
              de la Plataforma, incluyendo pérdidas de datos, de mensajes o de oportunidades
              comerciales. El servicio se provee "tal cual" y "según disponibilidad".
            </p>
          </Section>

          <Section title="9. Indemnización">
            <p>
              El usuario acepta mantener indemne a ebooksdgg y a Atlas frente a reclamos de
              terceros derivados del uso indebido de la Plataforma o del incumplimiento de estas
              Condiciones o de las políticas de Meta y WhatsApp.
            </p>
          </Section>

          <Section title="10. Suspensión y terminación">
            <p>
              Podemos suspender o terminar el acceso a la Plataforma en caso de incumplimiento de
              estas Condiciones, de las políticas de Meta o WhatsApp, o por requerimiento legal.
              El usuario puede dejar de usar la Plataforma y desconectar sus cuentas en cualquier
              momento.
            </p>
          </Section>

          <Section title="11. Cambios a las Condiciones">
            <p>
              Podemos actualizar estas Condiciones ocasionalmente. La versión vigente se publicará
              en esta misma dirección con su fecha de última actualización. El uso continuado de la
              Plataforma implica la aceptación de los cambios.
            </p>
          </Section>

          <Section title="12. Ley aplicable">
            <p>
              Estas Condiciones se rigen por las leyes de la República Argentina, sin perjuicio de
              las normas imperativas de protección que pudieran corresponder al usuario.
            </p>
          </Section>

          <Section title="13. Contacto">
            <p>
              Para cualquier consulta sobre estas Condiciones, escribinos a{" "}
              <a href="mailto:ebooksdgg@gmail.com" className="text-primary underline underline-offset-2">
                ebooksdgg@gmail.com
              </a>
              .
            </p>
          </Section>
        </div>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-foreground border-b border-border pb-2">{title}</h2>
      <div className="text-muted-foreground leading-relaxed space-y-3 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:space-y-2 [&_strong]:text-foreground [&_a]:text-primary">
        {children}
      </div>
    </section>
  )
}
