// The one door to the host. Imported as a namespace so the plugin feature-detects newer exports
// (`sdk.createBudgetedLoop`, `sdk.TRANSCRIPT_DIRECTIVE_AREA`) instead of failing to load on an older
// Desktop, which is what a named import of a missing export does.
import * as sdk from '@hermes/plugin-sdk'

export { sdk }
