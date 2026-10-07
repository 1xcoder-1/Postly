/**
 * Tech-only content policy for Topic Radar.
 *
 * Every crawler is seeded with tech accounts, repos and feeds, but their
 * timelines still carry world news, sports, biology, climate, machinery,
 * puzzle hints and Prime Day deals. A title must clear four ordered tiers
 * before it can reach a tab:
 *   HARD   unmistakably non-tech domains -> always dropped
 *   DEALS  shopping/deal spam -> never a postable topic
 *   SOFT   domain words that collide with tech vocabulary ("mining" inside
 *          "Import AI 471: ... space mining") -> dropped only when the title
 *          shows no tech signal
 *   SIGNAL general/social feeds (Bluesky, X, Threads, Facebook, Instagram,
 *          Agent Reach) must show a tech signal at all
 * Tier contents were tuned against a full crawl of all 13 tabs (every tab still
 * clears its 90-topic quota), so re-measure before trimming them. Disable with
 * TECH_ONLY=0.
 */

// Unmistakably non-tech domains.
const HARD_NON_TECH_SRC = [
  String.raw`biolog\w*|genetic\w*|genom\w*|crispr|rna|protein|enzyme|cell\s*biology|cancer|tumou?r`,
  String.raw`carcinoma|vaccin\w*|diseas\w*|epidemic|outbreak|pandemic|mosquito|medical|medicine|patient`,
  String.raw`clinical|therapy|therapeutic|diagnos\w*|surger\w*|hospital|nurse|pharma\w*|drug|pill`,
  String.raw`weight\s*loss|diet|nutrition|longevity|microbiome|antibiotic|immune|antibod\w*|neuron`,
  String.raw`synapse|brain\s*(?:scan|study)|mind\s*health|gifted\s*(?:and|children)|twice-exceptional`,
  String.raw`glucose|insulin|blood\s*pressure|cholesterol|sleep\s*(?:apnea|tracking|debt)|geolog\w*`,
  String.raw`geophysic\w*|earthquake|volcan\w*|tectonic|tsunami|glacier|ice\s*sheet|sea\s*level|erosion`,
  String.raw`sediment|aquifer|watershed|astronom\w*|astrophysic\w*|exoplanet|black\s*hole|nebula`,
  String.raw`supernova|pulsar|quasar|cosmos|cosmolog\w*|asteroid|telescope|observator\w*`,
  String.raw`space\s*(?:station|walk|probe|debris|eclipse)|solar\s*(?:eclipse|system|flare)|dinosaur`,
  String.raw`fossil\w*|paleontolog\w*|ice\s*age|extinction\s*event|species|wildlife|endangered`,
  String.raw`conservation|habitat|poaching|biodiversity|hunting\s*season|fungi|mushroom|coral|reef`,
  String.raw`mangrove|jungle|rainforest|wildfire|reforestation|birdwatch\w*|machinery|gearbox|crankshaft`,
  String.raw`welding|forging|foundry|metalwork|excavat\w*|bulldozer|forklift|stevedore|cargo\s*ship`,
  String.raw`container\s*ship|shipping\s*lane|agriculture|farming|farmer|irrigation|tractor|cattle`,
  String.raw`livestock|poultry|sheep|fertilizer|pesticide|herbicide|wheat|maize|barley|orchard|dairy`,
  String.raw`football|soccer|cricket|rugby|basketball|baseball|volleyball|nba|nfl|mlb|nhl`,
  String.raw`premier\s*league|tennis|boxing|mma|wrestling|olympic|marathon|athlete|referee|touchdown`,
  String.raw`goalkeeper|hockey|yankees|matchday|scoreline|grand\s*slam|military|navy|air\s*force|warfare`,
  String.raw`warhead|missile|drone\s*strike|soldier|veteran|espionage|treason|guilty|pleaded|arrested`,
  String.raw`indict\w*|congress|church|mosque|cathedral|priest|pastor|rabbi|imam|pope|bible|quran|gospel`,
  String.raw`theology|spiritual|spiritualit\w*|meditation|mindfulness|manifestation|horoscope|astrology`,
  String.raw`zodiac|tarot|palm\s*reading|crystal\s*healing|hollywood|celebrit\w*|actor|actress|singer`,
  String.raw`songwriter|band|album|song|concert|tour\s*dates|festival\s*lineup|box\s*office`,
  String.raw`streaming\s*series|reality\s*show|awards?\s*(?:ceremony|night)|season\s*\d|premiere\s*date`,
  String.raw`cast\s*(?:announcement|reveal)|franchise\s*reboot|slasher|costume|box\s*set|blind\s*box|emmy`,
  String.raw`oscars?\b|golden\s*globe|rtvd\b|mental\s*health|sanction|tariff|lobbying|legislature`,
  String.raw`congressional|lawmaker|bill\s*passed|state\s*secret|battlefield|nato|ceasefire|invasion`,
  String.raw`genocide|war\s*crime|terroris\w*|insurgent|militia|recipe|chef|baking|bakery|cuisine|flavour`,
  String.raw`flavor|coffee\s*maker|starbucks|sugar-free|murder|homicide|robbery|burglary|kidnap`,
  String.raw`car\s*jack\w*|arson|assault|felon\w*|theft|nobel\s*prize|nobelprize`,
  String.raw`nobel\s*(?:physics|chemistry|medicine|peace|literature)|wordle`,
  String.raw`nyt\s*(?:strands|connections|crossword)|daily\s*hints|climate|global\s*warming`,
  String.raw`greenhouse\s*gas|carbon\s*(?:footprint|credit|offset)|ex-?wife|ex-?husband|paternity`,
  String.raw`children\s*with|had\s*children|divorce|custody`,
]
const HARD_NON_TECH = new RegExp(`\\b(${HARD_NON_TECH_SRC.join('|')})\\b`, 'i')

// Shopping / deal spam - not a postable topic.
const DEALS_SPAM_SRC = [
  String.raw`\bprime\s*day\b|\bprime\s*big\b|\bdeal\s*days?\b|\bblack\s*friday\b|\bcyber\s*monday\b`,
  String.raw`\bdiscount\w*|%\s*off|\$\d+\s*off|\bunder\s*\$\d|\bsave\s*up\s*to|\blowest\s*price\b`,
  String.raw`\bvoucher\b|\bsale\s*price\b|\bon\s*sale\b|\bclearance\b|\bgiveaway\b|\bbest\s*price\b`,
  String.raw`\bsub-\$\d|\breduced\s*by\s*\d|\bfreebies?\b|\bprice\s*(?:cut|history)\b|\bprice\s*drop\w*`,
  String.raw`\bearly\s*bird\b|\bdown\s*to\s*\$\d`,
]
const DEALS_SPAM = new RegExp(`${DEALS_SPAM_SRC.join('|')}`, 'i')

// Non-tech domain words that collide with tech vocabulary; dropped only when the
// title carries no tech signal ("Import AI 471: ... space mining" stays).
const SOFT_NON_TECH_SRC = [
  String.raw`weather|storm|hurricane|tornado|rainfall|monsoon|drought|flood|heat\s*wave|cold\s*snap`,
  String.raw`carbon|emission\w*|renewable|solar|wind\s*turbine|wind\s*farm|power\s*(?:plant|grid)`,
  String.raw`smart\s*grid|nuclear|fossil\s*fuel|diesel|petroleum|coal|ocean|sea\s*ice|tide|pollution`,
  String.raw`environmental|endangered\s*plants?|mining|quarry|drilling|refinery|smelting|oil\s*field`,
  String.raw`gas\s*field|hydraulic|pneumatic|piston|turbine|motor|gear|bearing|screw|weld|lathe|mill`,
  String.raw`machining|machine\s*(?:shop|tool|part|shop)|cnc|3d\s*print\w*|virus|bacteria|microbe|gene`,
  String.raw`organ|tissue|blood|bone|muscle|fitness|workout|gym|yoga|wellness|movie|film|cinema|trailer`,
  String.raw`review(?:s)?\s*(?:of|for)\s*(?:the\s*)?(?:movie|film|show|album)|game|games|gaming`,
  String.raw`playstation|xbox|nintendo|steam\s*deck|police|court|lawsuit|judge|ruling|verdict|settl\w*`,
  String.raw`attorney|prosecutor|regulat\w*|\bban\b|banned|president|parliament|senate|government`,
  String.raw`minister|agency|federal|mayor|gop|democrat|restaurant|food|drink|coffee|tea|wine|beer`,
  String.raw`brewing|election|electoral|referendum|presidential|senate|senator|governor|mayor|monarch`,
  String.raw`prime\s*minister|ballot|campaign\s*trail|voter|turnout|midterms?|poll\s*result|homework`,
  String.raw`impeach\w*|white\s*house|oval\s*office|republican|electoral|religion|religious|faith|allah`,
  String.raw`buddh\w*|hindu|muslim|jewish|christian|atheis\w*|tourism|hotel|airport|airline|cruise|visa`,
  String.raw`backpack|road\s*trip|car|cars|truck|suv|sedan|motorcycle|scooter|highway|parking|ev\b|hybrid`,
  String.raw`baby|kids|child|children|teen|teenager|family|mother|father|pregnan\w*|real\s*estate|housing`,
  String.raw`apartment|mortgage|landlord|rental|furniture|interior|decorat\w*|artwork|painting|sculpture`,
  String.raw`gallery|museum|photograph\w*|photography|archaeolog\w*|ancient|heritage|memorial|school`,
  String.raw`classroom|teacher|school\s*principal|kindergarten|scholarship|tuition|curriculum|student`,
  String.raw`students|exam|exams|highschool|middleschool|elementary|golf|horror|slasher\w*|movie\s*review`,
  String.raw`heart\s*(?:rhythm|rate|attack|disease)|cardiac|afib|cholesterol|atmosphere|atmospheric`,
  String.raw`climate\s*(?:change|tech|crisis)|greenhouse`,
]
const SOFT_NON_TECH = new RegExp(`\\b(${SOFT_NON_TECH_SRC.join('|')})\\b`, 'i')

// Tech evidence in a title. Rescues SOFT hits, and is mandatory on the
// general/social feeds listed below.
const TECH_SIGNAL_SRC = [
  String.raw`ai|llm|llms|gpt[\w\.\-]*|a\.i|claude|gemini|grok|deepseek|qwen|llama\w*|mistral|copilot`,
  String.raw`chatgpt|openai|anthropic|perplexity|hugging\s*face|ollama|midjourney|stable\s*diffusion`,
  String.raw`model|models|model\w*|modelling|modeling|agent|agents|agentic|subagent|rag|fine-?tun\w*`,
  String.raw`prompt\w*|prompting|inference|embedding\w*|vector|transformer|diffusion|neural`,
  String.raw`machine\s*learning|deep\s*learning|reinforcement|training|benchmark\w*|gpu\w*|cuda|tpu|chip`,
  String.raw`chips|silicon|semiconductor|processor|quantum|robot\w*|robotics|drone|autonomous`,
  String.raw`self-driving|humanoid|exoskeleton|software|hardware|firmware|app|apps|application`,
  String.raw`applications|web|website|websites|webapp|browser|chrome|chromium|firefox|safari|edge|brave`,
  String.raw`server|servers|backend|frontend|fullstack|full-stack|headless|cloud|aws|azure|gcp|serverless`,
  String.raw`devops|sre|kubernetes|k8s|eks|gke|aks|docker|container|containers|orchestration|terraform`,
  String.raw`ansible|helm|ci/cd|cd\b|pipeline|deploy\w*|scal\w*|api|apis|sdk|sdks|cli|api-first|graphql`,
  String.raw`grpc|rest|soap|websocket|json|xml|yaml|yml|http|https|html|tcp|udp|tls|ssl|pki|smtp|imap|ftp`,
  String.raw`ssh|cdn|proxy|vpn|tailscale|nginx|apache|caddy|traefik|envoy|wasm|webassembly|bytecode`,
  String.raw`opcode|dev|devs|developer\w*|engineer|engineers|engineering|program\w*|programming|coder\w*`,
  String.raw`code|codes|coding|live\s*cod\w*|pseudocode|bytecod\w*|tech|technology|technologies`,
  String.raw`techindustry|digital|cyber|cybersecurity|infosec|security|privacy|encrypt\w*|breach`,
  String.raw`vulnerab\w*|exploit\w*|malware|ransomware|phishing|scam\w*|hack\w*|auth|oauth|sso|saml|jwt`,
  String.raw`rbac|mfa|token|tokens|identity|access\s*control|database|databases|sql|nosql|postgres`,
  String.raw`postgresql|mysql|mariadb|sqlite|mongodb|redis|kafka|clickhouse|duckdb|snowflake|bigquery`,
  String.raw`redshift|dynamodb|cassandra|neo4j|timescale|influxdb|supabase|planetscale|neon|turso|prisma`,
  String.raw`drizzle|kysely|typeorm|elastic|solr|github|gitlab|git|source\s*code|open[\s-]source`,
  String.raw`self-?hosted|repository|repos|fork|merge\s*request|release\w*|version|beta|alpha|stable|rc`,
  String.raw`update|patch|bug|bugfix|fix|hotfix|refactor|rewrite|runtime|compil\w*|interpreter|transpiler`,
  String.raw`framework|toolkit|library|libraries|package|packages|dependency|dependencies|npm|pnpm|pip`,
  String.raw`poetry|cargo|crates|maven|gradle|sbt|python|javascript|typescript|rust|golang|java|kotlin`,
  String.raw`swift|c\+\+|c#|\.net|dotnet|ruby|php|perl|scala|haskell|elixir|erlang|zig|clojure|dart|lua`,
  String.raw`r\s*programming|matlab|cobol|fortran|react|next\.?js|nuxt|svelte\w*|vue|astro|remix|angular`,
  String.raw`ember|solidjs|tailwind|shadcn|radix|node\.?js|node\b|nodes|deno|bun|vite|vitest|webpack`,
  String.raw`esbuild|rollup|turbopack|nx|turborepo|bazel|monorepo|wordpress|wp\b|woocommerce|drupal`,
  String.raw`joomla|framer|webflow|squarespace|elementor|airtable|hono|express|fastify|nestjs|django`,
  String.raw`flask|spring|rails|laravel|symfony|gin|axum|actix|rocket|startup|startups|founder|founders`,
  String.raw`funding|seed\s*round|series\s*[a-e]\b|raised|valuation|ipo|acquisition|acquire|merger`,
  String.raw`lay\s*offs?|layoff\w*|laid\s*off|laying\s*off|reorg|restructuring|hiring|recruit\w*`,
  String.raw`remote\s*work|salary|job|jobs|career|workforce|productivity|google|alphabet|microsoft|apple`,
  String.raw`amazon|meta|facebook|instagram|whatsapp|messenger|telegram|discord|slack|teams|notion|figma`,
  String.raw`canva|miro|vercel|netlify|cloudflare|fastly|akamai|stripe|shopify|square|paypal|plaid|twilio`,
  String.raw`sendgrid|mailgun|segment|amplitude|mixpanel|posthog|sentry|datadog|newrelic|grafana`,
  String.raw`prometheus|loki|opentelemetry|jaeger|zipkin|airflow|dbt|spark|flink|kafka\s*streams|pulsar`,
  String.raw`kinesis|nats|rabbitmq|temporal|inngest|trigger\.dev|n8n|zapier|make\.com|activepieces|dify`,
  String.raw`langchain|langgraph|crewai|autogen|agno|openhands|smolagents|spotify|netflix|uber|lyft`,
  String.raw`doordash|airbnb|instacart|shopify|nvidia|amd|intel|tsmc|arm|qualcomm|broadcom|asml|mediatek`,
  String.raw`samsung|xiaomi|huawei|oneplus|motorola|nothing\s*phone|tesla|spacex|blue\s*origin|twitter`,
  String.raw`x\.com|mastodon|bluesky|threads|linkedin|tiktok|snap|snapchat|youtube|reddit|quora|medium`,
  String.raw`stack\s*overflow|wikipedia|hacker\s*news|dev\.to|android|ios|ipados|windows|macos|linux`,
  String.raw`ubuntu|debian|fedora|arch|freebsd|kernel|unix|posix|iphone|ipad|apple\s*watch|airpods|pixel`,
  String.raw`galaxy|vision\s*pro|quest\s*[23]|surface|kindle|mac|macbook|imac|ios\s*app|smartphone|laptop`,
  String.raw`desktop|tablet|workstation|peripheral|monitor|keyboard|mouse|printer|scanner|router|modem`,
  String.raw`switch\w*|ethernet|wifi|wi-fi|bluetooth|caps\s*lock|keycap|remap|shortcut|hotkey|vr\b|xr\b`,
  String.raw`ar\b|headset|metaverse|oculus|controller|homelab|nas\b|raspberry\s*pi|rpi|proxmox|upstream`,
  String.raw`downstream|maintainer\w*|self-host\w*|phone|phones|mobile|cellular|esim|roaming|bluetooth\w*`,
  String.raw`charger\w*|power\s*bank|opengl|vulkan|directx|webgl|graphics|blender|gamedev|game\s*engine`,
  String.raw`unity|unreal|godot|usb|thunderbolt|nvme|ssd|hdd|ram\b|rom\b|batter\w*|charger|display|panel`,
  String.raw`resolution|refresh\s*rate|smartwatch\w*|smart\s*watch\w*|amazfit|mobvoi|monitor|speaker\w*`,
  String.raw`soundbar|headphone\w*|earbud\w*|earphon\w*|microphone\w*|webcam|razer|logitech|logi\b`,
  String.raw`corsair|steelseries|sonos|bose|jbl|gopro|dji|sony|anker|reolink|simplisafe|ultrahuman`,
  String.raw`ouraring|fitbit|garmin|smart\s*ring|pixel\s*watch|galaxy\s*watch|geforce\w*|geforce\s*now`,
  String.raw`switch\s*2|steam\s*(?:deck|os)?|playstation\s*5|xbox\s*series|cpu\w*|gpu\w*|soc|motherboard`,
  String.raw`overclock\w*|thermal|fan|heatsink|pc|pcie|crash\w*|segfault|deadlock|leak\w*|traceback`,
  String.raw`stack\s*trace|executor|thread\s*pool|context|prompt\s*engineer\w*|vibe\s*coding|ai\s*news`,
  String.raw`ainews|muse\b|solopreneur\w*|syntax|highlighter|highlighting|typing|dictation`,
  String.raw`voice\s*(?:input|note|memo|assistant)|build\w*|rebuild\w*|maker\s*space|fabricat\w*|micron`,
  String.raw`sandisk|seagate|social\s*media|platform\s*media|co-?ceo|ceo\b|cto\b|coo\b|cfo\b`,
  String.raw`chief\s*(?:executive|technology|product|science)|web\s*design\w*|webdesign\w*`,
  String.raw`virtual\s*(?:world|assistant)|crypto|bitcoin|ethereum|blockchain|web3|wallet|nft|defi`,
  String.raw`stablecoin|data|dataset|data\s*(?:center|science|engineering|warehouse)|dataframe|lakehouse`,
  String.raw`datalake|analytics|metrics|telemetry|observability|dashboard|latency|throughput|uptime`,
  String.raw`downtime|outage|incident|postmortem|reliability|availability|architecture|system\s*design`,
  String.raw`design\s*pattern|microservice\w*|monolith|event-driven|distributed|concurrency|parallelism`,
  String.raw`thread|threads|threading|mutex|semaphore|deadlock|async|await|coroutine|goroutine|channel`,
  String.raw`callback|promise|event\s*loop|algorithm|complexity|big\s*o|optimi[sz]\w*|cache|caching|index`,
  String.raw`indexing|query|queries|search|search\s*engine|recommendation|recommender|personali[sz]ation`,
  String.raw`adtech|seo|sem|streaming|real-?time|batch|etl|elt|warehouse|airbyte|debezium|canal|saas|paas`,
  String.raw`iaas|platform\w*|product|feature|launch|launches|launched|ship|shipped|shipping`,
  String.raw`introduc(?:e|es|ing)|announc\w*|unveil\w*|debut|preview|general\s*availability|ga\b`,
  String.raw`show\s*hn|ask\s*hn|tell\s*hn|lobste|\d+\.\d+\b|v\d+\.\d+|summit|conf\b|conference|keynote`,
  String.raw`talks?|recordings?|recap|wrap-?up|year\s*in\s*review|pycon|jsconf|rustconf|rubyconf|devcon`,
  String.raw`kubecon|wwdc|re:invent|github\s*universe|google\s*io\b|meta\s*connect|dev\s*fest`,
  String.raw`developer\s*(?:event|conference)|retrospective|roundup|digest|event|workshop|webinar`,
  String.raw`open\s*sourcing|prototype|mvp|roadmap|beta\s*test|rollout|gradual|canary|rollback|ui|ux`,
  String.raw`usability|design\w*|designer\w*|interface\w*|interaction|design\s*system|component`,
  String.raw`components|css|html|dom|svg|canvas|accessibility|responsive|dark\s*mode|animation\w*`,
  String.raw`typography|typeface\w*|font|fonts|icon|icons|figma|sketch|theme\w*|template\w*|wireframe\w*`,
  String.raw`mockup\w*|prototype\w*|wallpaper\w*|branding|no-code|low-code|automation|workflow|workflows`,
  String.raw`integration|integrations?|plugin|plugins|extension|addon|widget|macro|script|snippet`,
  String.raw`boilerplate|template|templates|generator|tool|tools|tooling|devtools|ide|vs\s*code|vscode`,
  String.raw`jetbrains|intellij|pycharm|cursor|windsurf|zed|sublime|vim|neovim|emacs|terminal|shell|bash`,
  String.raw`zsh|fish|powershell|ssh|tmux|regex|cron|daemon|process|memory|leak|profile|profiling|tracing`,
  String.raw`debug|debugging|virtual\s*machine|vm|hypervisor|emulator|sandbox|containerized|bare\s*metal`,
  String.raw`edge\s*computing|simd|wasm|webassembly|assembly|bytecode|opcode|binary|executable|linker`,
  String.raw`loader|unicode|utf-\d|ascii|bitmap|pixel|pixels|shader|render|rendering|renderer|sprite`,
  String.raw`voxel|torch|pytorch|tensorflow|keras|jax|onnx|triton|mlflow|wandb|weights\s*&\s*biases`,
  String.raw`kaggle|jupyter|notebook|colab|dataset|annotation|labeling|dataset|nlp|bert|roberta|tokenizer`,
  String.raw`ner\b|named\s*entity|speech|tts|asr|ocr|translat\w*|translation\w*|locali[sz]at\w*`,
  String.raw`internationali[sz]at\w*|multilingual|text-to-\w*|image\s*generat\w*|video\s*generat\w*`,
  String.raw`video\s*editor|editor|voice\s*clon\w*|generative|generation|multimodal|computer\s*vision`,
  String.raw`diffusion\w*|agi|rsi\b|superintelligence|super\s*human|alignment|reasoning|chain-of-thought`,
  String.raw`zero-?shot|redundan\w*|fault\s*tolerance|high\s*availability|resilien\w*|mission-?critical`,
  String.raw`infrastructure|disaster\s*recovery|backup|failover|redundancy|provenance|watermark\w*`,
  String.raw`deepfake|sequoia|a16z|yc\b|y\s*combinator|vc\b|investor|share\s*price|stock|shares|earnings`,
  String.raw`quarterly|red\s*hat|suse|canonical|jdk|jvm|lightwell|execution|intelligence|cognitive`,
  String.raw`newsletter|substack|blog|podcast|youtube\s*video|tutorial|walkthrough|documentation|docs|psf`,
  String.raw`pypi|packaging|python\s*software\s*foundation|virtualenv|venv|conda|wheel\b|elon\s*musk|musk`,
  String.raw`altman|amodei|zuckerberg|pichai|nadella|bezos|hinton|karpathy|carmack|sam\s*altman|sundar`,
  String.raw`satya|jen\s*hwan|tobi|linus|torvalds|gates|buffett|computer\w*|computing|computation|mcp\b`,
  String.raw`model\s*context\s*protocol|webmcp|a2a|pwa|spa|ssr|csr|isr|domain\w*|subdomain|migration`,
  String.raw`hosting|uptime\s*monitor|attack\w*|threat|intrusion|ddos|brute\s*force|two-?factor`,
  String.raw`zero\s*trust|sandboxing|smart\s*glasses|glasses|wearable\w*|fitness\s*tracker|smart\s*home`,
  String.raw`iot|sensor|internet|broadband|network\w*|bandwidth|fiber|satellite|isp|5g|6g`,
  String.raw`net\s*neutrality|office|outlook|excel|sharepoint|onedrive|word\s*processor|powerpoint|access`,
  String.raw`vmware|oracle|ibm|dell|lenovo|adobe|autodesk|siemens|sap|servicenow|workday|oracle\s*cloud`,
  String.raw`pinterest|grab|gojek|doordash|revolut|monzo|wise|kucoin|binance|coindesk|troubleshoot\w*`,
  String.raw`debugger|stack\s*trace|stack\s*overflow|root\s*cause|rca|runbook|wireless\b|controller\w*`,
  String.raw`gamepad\w*|setup\b|setups\b|desk\s*setup|cable\w*|dock\w*`,
]
const TECH_SIGNAL = new RegExp(`\\b(${TECH_SIGNAL_SRC.join('|')})\\b`, 'i')

/** Social/general-interest feeds: mixed content, so a tech signal is required. */
const GENERAL_FEEDS = ['bluesky', 'bsky', 'x/', 'threads', 'facebook', 'instagram', 'agent-reach']

function isGeneralFeed(source: string): boolean {
  const s = (source || '').toLowerCase()
  return s === 'x' || GENERAL_FEEDS.some((prefix) => s.startsWith(prefix))
}

function techOnlyEnabled(): boolean {
  return process.env.TECH_ONLY !== '0' && process.env.TECH_ONLY !== 'false'
}

/** True when the topic is tech-related enough to show on the radar. */
function isTechTopic(title: string, source: string): boolean {
  if (HARD_NON_TECH.test(title)) return false
  if (DEALS_SPAM.test(title)) return false
  const hasSignal = TECH_SIGNAL.test(title)
  if (SOFT_NON_TECH.test(title) && !hasSignal) return false
  if (isGeneralFeed(source) && !hasSignal) return false
  return true
}

export { techOnlyEnabled, isTechTopic }
