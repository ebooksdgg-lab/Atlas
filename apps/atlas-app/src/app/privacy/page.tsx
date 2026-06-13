export const metadata = {
  title: "Política de Privacidad — Atlas",
}

export default function PrivacyPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-3xl font-bold mb-2">Política de Privacidad de Atlas</h1>
        <p className="text-sm text-muted-foreground mb-12">Última actualización: 13 de junio de 2026</p>

        <div className="prose prose-invert prose-sm max-w-none space-y-10">
          <p className="text-muted-foreground leading-relaxed">
            Esta Política de Privacidad describe cómo Atlas ("Atlas", "nosotros" o "la Plataforma")
            recopila, usa, almacena y protege la información en relación con el uso de nuestra
            plataforma de automatización y gestión de mensajería de WhatsApp Business. Al utilizar
            Atlas, aceptás las prácticas descritas en esta política.
          </p>

          <Section title="1. Quiénes somos">
            <p>
              Atlas es una plataforma operada por <strong>ebooksdgg</strong> que permite conectar y
              administrar cuentas de WhatsApp Business, centralizar conversaciones y automatizar
              flujos de mensajería. Para cualquier consulta sobre privacidad podés contactarnos en{" "}
              <a href="mailto:ebooksdgg@gmail.com" className="text-primary underline underline-offset-2">
                ebooksdgg@gmail.com
              </a>
              .
            </p>
          </Section>

          <Section title="2. Información que recopilamos">
            <p>Para prestar el servicio, Atlas puede recopilar y procesar:</p>
            <ul>
              <li>
                <strong>Datos de cuentas de WhatsApp Business:</strong> identificadores de cuentas
                de WhatsApp Business (WABA), identificadores de números de teléfono, nombres de
                visualización, calificación de calidad y límites de mensajería.
              </li>
              <li>
                <strong>Tokens de acceso:</strong> tokens de acceso provistos por Meta durante el
                proceso de conexión, utilizados exclusivamente para operar las cuentas que el
                usuario decide conectar. Estos tokens se almacenan cifrados.
              </li>
              <li>
                <strong>Contenido de mensajería:</strong> mensajes enviados y recibidos a través
                de los números conectados, incluyendo texto, archivos adjuntos y metadatos
                asociados, con el fin de prestar las funciones de conversación y automatización.
              </li>
              <li>
                <strong>Datos de contactos:</strong> números de teléfono y nombres de perfil de
                las personas que interactúan con los números conectados.
              </li>
              <li>
                <strong>Datos técnicos:</strong> registros de actividad, marcas de tiempo y datos
                de diagnóstico necesarios para el funcionamiento y la seguridad de la Plataforma.
              </li>
            </ul>
          </Section>

          <Section title="3. Cómo usamos la información">
            <p>Utilizamos la información recopilada para:</p>
            <ul>
              <li>Conectar y administrar las cuentas de WhatsApp Business que el usuario elige integrar.</li>
              <li>Enviar, recibir y enrutar mensajes a través de los números conectados.</li>
              <li>Ejecutar flujos de automatización configurados por el usuario.</li>
              <li>Mantener, asegurar y mejorar el funcionamiento de la Plataforma.</li>
              <li>Cumplir con obligaciones legales y con las políticas de Meta y WhatsApp.</li>
            </ul>
            <p>
              No utilizamos el contenido de los mensajes para fines distintos a la prestación del
              servicio, ni para publicidad de terceros.
            </p>
          </Section>

          <Section title="4. Cómo compartimos la información">
            <p>No vendemos información personal. Podemos compartir información únicamente en los siguientes casos:</p>
            <ul>
              <li>
                <strong>Con Meta Platforms:</strong> según sea necesario para operar la integración
                con la API de WhatsApp Business, conforme a las Condiciones de la Plataforma de Meta.
              </li>
              <li>
                <strong>Con proveedores de infraestructura:</strong> servicios de alojamiento y
                procesamiento que actúan en nuestro nombre bajo obligaciones de confidencialidad,
                exclusivamente para hacer funcionar la Plataforma.
              </li>
              <li>
                <strong>Por obligación legal:</strong> cuando una autoridad competente lo requiera
                conforme a la ley aplicable.
              </li>
            </ul>
          </Section>

          <Section title="5. Almacenamiento y seguridad">
            <p>
              La información se almacena en infraestructura propia con medidas de seguridad
              razonables. Los tokens de acceso se almacenan cifrados. Aplicamos controles de
              acceso para limitar quién puede acceder a los datos. Ningún sistema es completamente
              infalible, pero trabajamos para proteger la información contra accesos no autorizados.
            </p>
          </Section>

          <Section title="6. Retención de datos">
            <p>
              Conservamos la información durante el tiempo necesario para prestar el servicio y
              cumplir con obligaciones legales. Cuando un usuario desconecta una cuenta o deja de
              usar la Plataforma, eliminamos o anonimizamos los datos asociados dentro de un plazo
              razonable, salvo que la ley exija conservarlos.
            </p>
          </Section>

          <Section title="7. Eliminación de datos">
            <p>
              Podés solicitar la eliminación de tus datos en cualquier momento escribiendo a{" "}
              <a href="mailto:ebooksdgg@gmail.com" className="text-primary underline underline-offset-2">
                ebooksdgg@gmail.com
              </a>
              . Procesaremos la solicitud y eliminaremos la información asociada, salvo aquella que
              debamos conservar por obligación legal. La desconexión de un número desde la Plataforma
              también revoca el acceso y elimina los tokens asociados.
            </p>
          </Section>

          <Section title="8. Tus derechos">
            <p>
              Según la legislación aplicable, podés solicitar acceso, rectificación o eliminación
              de tu información personal, así como oponerte a determinados tratamientos. Para
              ejercer estos derechos, contactanos en{" "}
              <a href="mailto:ebooksdgg@gmail.com" className="text-primary underline underline-offset-2">
                ebooksdgg@gmail.com
              </a>
              .
            </p>
          </Section>

          <Section title="9. Cumplimiento con políticas de Meta y WhatsApp">
            <p>
              El uso de Atlas está sujeto a las Condiciones de la Plataforma de Meta y a las
              Políticas de WhatsApp Business. Los usuarios son responsables de utilizar la
              Plataforma conforme a dichas políticas.
            </p>
          </Section>

          <Section title="10. Cambios a esta política">
            <p>
              Podemos actualizar esta Política de Privacidad ocasionalmente. Publicaremos la
              versión vigente en esta misma dirección, indicando la fecha de última actualización.
            </p>
          </Section>

          <Section title="11. Contacto">
            <p>
              Para cualquier consulta sobre esta Política de Privacidad o sobre el tratamiento de
              tus datos, escribinos a{" "}
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
