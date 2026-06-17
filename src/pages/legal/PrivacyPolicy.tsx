import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';

const EMAIL = 'neurofluency.oficial@gmail.com';

/**
 * Política de Privacidade (LGPD) do Kioku. Rota pública /privacidade, acessível
 * logado ou não, para ser referenciada pelo checkbox de consentimento do cadastro
 * e pelo rodapé da landing. Documento longo, estilizado com os tokens do app
 * (fundo escuro, Fraunces nos títulos, Manrope no corpo) via a classe .legal-doc.
 */
export function PrivacyPolicy() {
  return (
    <div className="min-h-screen" style={{ background: 'var(--bg)', color: 'var(--fg)' }}>
      <header
        className="sticky top-0 z-10"
        style={{
          background: 'color-mix(in srgb, var(--bg) 86%, transparent)',
          backdropFilter: 'blur(8px)',
          borderBottom: '1px solid var(--line)',
        }}
      >
        <div className="mx-auto max-w-[760px] px-5 md:px-8 h-14 flex items-center">
          <Link to="/" className="back-link" style={{ fontSize: 13 }}>
            <ArrowLeft size={15} className="back-link-arrow" />
            Voltar ao Kioku
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-[760px] px-5 md:px-8 py-12 md:py-16">
        <article className="legal-doc">
          <h1
            className="display"
            style={{ fontSize: 'clamp(28px, 5vw, 40px)', fontWeight: 600, lineHeight: 1.15 }}
          >
            Política de Privacidade do Kioku
          </h1>
          <p className="mono" style={{ color: 'var(--muted)', fontSize: 12, marginTop: 10 }}>
            Última atualização: junho de 2026
          </p>

          <p>
            Esta Política de Privacidade descreve como o Kioku coleta, usa, armazena, compartilha e
            protege os seus dados pessoais, em conformidade com a Lei Geral de Proteção de Dados (Lei
            nº 13.709/2018, a "LGPD"). Ao criar uma conta e utilizar o Kioku, você declara estar
            ciente desta política. Recomendamos a leitura completa.
          </p>

          <h2>1. Quem é o responsável pelos seus dados</h2>
          <p>
            O responsável pelo tratamento dos seus dados pessoais (o "controlador", na linguagem da
            LGPD) é: Pedro Xavier Rodrigues Sant'Ana, pessoa física responsável pela operação do Kioku
            (kioku.com.br). Para qualquer questão relacionada à privacidade e aos seus dados, incluindo
            o exercício dos direitos descritos nesta política, você pode entrar em contato pelo
            e-mail: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
          </p>

          <h2>2. Quais dados coletamos</h2>
          <p>Coletamos apenas os dados necessários para oferecer e operar o serviço. São eles:</p>
          <p>
            <strong>Dados que você fornece ao criar a conta e usar o app.</strong> O seu endereço de
            e-mail, a sua senha (que é armazenada de forma criptografada, por meio de hash, e nunca é
            visível para nós nem para terceiros), o seu nome de exibição e, opcionalmente, o seu
            número de telefone. O telefone não é obrigatório, e a sua conta funciona normalmente sem
            ele.
          </p>
          <p>
            <strong>Dados de uso do aplicativo.</strong> As informações que você gera ao utilizar o
            Kioku, como os baralhos (decks) e cartões (flashcards) que você cria ou importa, o seu
            progresso de estudo, o histórico de revisões e as configurações da sua conta. Esses dados
            existem para que o aplicativo funcione e para sincronizar o seu estudo entre dispositivos.
          </p>
          <p>
            <strong>Dados de pagamento.</strong> Quando você assina um plano pago, o pagamento é
            processado pela plataforma Kiwify. É a Kiwify que coleta e processa os dados necessários à
            cobrança, como CPF, nome e dados do cartão de crédito. Nós não coletamos, não armazenamos e
            não temos acesso aos dados do seu cartão. Recebemos da Kiwify apenas a confirmação de que
            um pagamento foi aprovado, renovado, cancelado ou estornado, associada ao e-mail da compra,
            para liberar ou encerrar o seu acesso ao plano contratado.
          </p>

          <h2>3. Para que usamos os seus dados</h2>
          <p>Utilizamos os seus dados pessoais para as seguintes finalidades:</p>
          <p>
            <strong>Para operar o serviço,</strong> o que inclui autenticar o seu acesso, manter a sua
            conta, armazenar e sincronizar os seus baralhos, cartões e progresso de estudo, e oferecer
            os recursos do aplicativo.
          </p>
          <p>
            <strong>Para processar pagamentos e gerenciar a sua assinatura,</strong> liberando o
            acesso ao plano contratado quando o pagamento é confirmado e encerrando-o em caso de
            cancelamento, estorno ou não renovação.
          </p>
          <p>
            <strong>Para comunicação e marketing, quando você consente com isso.</strong> Podemos
            enviar comunicações sobre novidades, conteúdos e ofertas do Kioku. Esse uso depende do seu
            consentimento, que você fornece de forma livre e que pode ser retirado a qualquer momento,
            conforme descrito na seção 8.
          </p>

          <h2>4. Com base em que tratamos os seus dados (bases legais)</h2>
          <p>
            O tratamento dos seus dados se apoia nas bases legais previstas na LGPD. O tratamento
            necessário para operar o app e manter a sua conta apoia-se na execução do contrato firmado
            entre você e o Kioku ao aceitar usar o serviço. O tratamento para processar pagamentos
            apoia-se igualmente na execução desse contrato e no cumprimento de obrigações legais
            aplicáveis. O tratamento para fins de comunicação e marketing apoia-se no seu
            consentimento, recolhido de forma específica e destacada no momento do cadastro.
          </p>

          <h2>5. Com quem compartilhamos os seus dados</h2>
          <p>
            Para operar o Kioku, contamos com empresas que processam dados em nosso nome (chamadas de
            "operadores" pela LGPD). Compartilhamos com elas apenas o necessário para a prestação do
            serviço, e elas estão obrigadas a tratar os dados conforme a finalidade para a qual foram
            contratadas. São elas:
          </p>
          <ul>
            <li>
              <strong>Supabase,</strong> que fornece o banco de dados e a autenticação, onde ficam
              armazenados a sua conta e os seus dados de uso. Os dados do Kioku no Supabase estão
              hospedados em servidores localizados no Brasil (região de São Paulo).
            </li>
            <li>
              <strong>Cloudflare,</strong> que fornece a hospedagem do aplicativo e a infraestrutura
              que processa as requisições do serviço.
            </li>
            <li>
              <strong>Kiwify,</strong> que processa os pagamentos e as assinaturas.
            </li>
            <li>
              <strong>Google Cloud,</strong> cujo serviço de conversão de texto em fala
              (Text-to-Speech) é utilizado para gerar os áudios dos cartões.
            </li>
            <li>
              <strong>OpenAI,</strong> cujo serviço é utilizado para a geração de imagens dos cartões
              por inteligência artificial.
            </li>
            <li>
              <strong>Google (Gemini),</strong> cujo serviço de inteligência artificial é utilizado
              para a geração de baralhos e de conteúdo dos cartões.
            </li>
          </ul>
          <p>Não vendemos os seus dados pessoais a terceiros.</p>

          <h2>6. Transferência internacional de dados</h2>
          <p>
            Embora os dados principais da sua conta fiquem hospedados no Brasil, alguns dos serviços
            que utilizamos (como Cloudflare, OpenAI e Google) processam dados em servidores localizados
            fora do país. Isso significa que, ao utilizar determinados recursos, os dados necessários
            àquele recurso podem ser processados no exterior. A LGPD permite essa transferência
            internacional, e buscamos trabalhar com fornecedores que adotam padrões adequados de
            proteção de dados.
          </p>

          <h2>7. Por quanto tempo guardamos os seus dados</h2>
          <p>
            Mantemos os seus dados enquanto a sua conta estiver ativa e pelo tempo necessário para
            cumprir as finalidades descritas nesta política. Caso você solicite a exclusão da sua
            conta, removeremos os seus dados pessoais, ressalvadas as informações que precisemos reter
            para cumprir obrigações legais, regulatórias ou para o exercício regular de direitos, como
            registros de transações financeiras, que podem ser mantidos pelos prazos exigidos por lei.
          </p>

          <h2>8. Os seus direitos como titular dos dados</h2>
          <p>
            A LGPD garante a você uma série de direitos sobre os seus dados pessoais. Você pode, a
            qualquer momento, solicitar a confirmação de que tratamos os seus dados e o acesso a eles;
            solicitar a correção de dados incompletos, inexatos ou desatualizados; solicitar a
            anonimização, o bloqueio ou a eliminação de dados desnecessários ou tratados em
            desconformidade com a lei; solicitar a portabilidade dos seus dados; solicitar a
            eliminação dos dados tratados com base no seu consentimento; obter informação sobre as
            entidades com as quais compartilhamos os seus dados; e revogar o seu consentimento. No caso
            específico das comunicações de marketing, você pode retirar o seu consentimento a qualquer
            momento, sem que isso afete o funcionamento da sua conta ou o seu acesso ao serviço. Para
            exercer qualquer um desses direitos, basta entrar em contato pelo e-mail{' '}
            <a href={`mailto:${EMAIL}`}>{EMAIL}</a>. Responderemos à sua solicitação dentro dos prazos
            previstos pela legislação.
          </p>

          <h2>9. Como protegemos os seus dados</h2>
          <p>
            Adotamos medidas de segurança técnicas e organizacionais para proteger os seus dados. A sua
            senha é armazenada de forma criptografada e nunca em texto legível. O acesso aos seus dados
            é controlado por regras de segurança que limitam cada usuário aos seus próprios dados. As
            comunicações entre o aplicativo e os nossos servidores ocorrem por conexões criptografadas
            (HTTPS). Os dados de pagamento são tratados pela Kiwify, em ambiente próprio dela. Apesar de
            todos os esforços, nenhum sistema é completamente imune a incidentes, e nos comprometemos a
            agir com diligência caso algum ocorra.
          </p>

          <h2>10. Dados de crianças e adolescentes</h2>
          <p>
            O Kioku não é direcionado a menores de idade desacompanhados. Caso um menor utilize o
            serviço, isso deve ocorrer com o conhecimento e o consentimento dos pais ou responsáveis
            legais. Se identificarmos que coletamos dados de uma criança sem o devido consentimento,
            tomaremos as medidas para remover essas informações.
          </p>

          <h2>11. Alterações nesta política</h2>
          <p>
            Esta política pode ser atualizada a qualquer momento para refletir mudanças no serviço ou na
            legislação. Quando isso acontecer, atualizaremos a data de "última atualização" no topo do
            documento. Em caso de mudanças significativas, buscaremos comunicar você pelos meios
            disponíveis. Recomendamos que você revise esta política periodicamente.
          </p>

          <h2>12. Contato</h2>
          <p>
            Em caso de dúvidas sobre esta Política de Privacidade ou sobre o tratamento dos seus dados,
            entre em contato pelo e-mail: <a href={`mailto:${EMAIL}`}>{EMAIL}</a>.
          </p>
        </article>
      </main>
    </div>
  );
}
