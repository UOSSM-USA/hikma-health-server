// Top-level entry point. Re-exports the public surface of the package so
// consumers can `import { EventForm, RegistrationForm, Translations, Shared }
// from "@hikmahealth/forms"` instead of reaching into individual submodules.
//
// Subpath imports (`@hikmahealth/forms/EventForm`, etc.) are also supported
// via the `exports` map in package.json; both styles point at the same
// generated artifacts.

@genType
module Shared = Shared

@genType
module EventForm = EventForm

@genType
module RegistrationForm = RegistrationForm

@genType
module Translations = Translations

@genType
module Rules = Rules

@genType
module RuleValidation = RuleValidation

@genType
module RuleTemplates = RuleTemplates

@genType
module RuleCycles = RuleCycles
