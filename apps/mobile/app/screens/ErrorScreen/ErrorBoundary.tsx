import { Component, ErrorInfo, ReactNode } from "react"

import { ErrorType, reportCrash } from "@/utils/crashReporting"

import { ErrorDetails } from "./ErrorDetails"

interface Props {
  children: ReactNode
  catchErrors: "always" | "dev" | "prod" | "never"
}

interface State {
  error: Error | null
  errorInfo: ErrorInfo | null
}

/**
 * Catches render errors thrown anywhere below it, reports them, and swaps in an error screen.
 *
 * `catchErrors` controls whether that screen is shown; errors are always reported.
 *
 * This is a class because React only supports error boundaries as class components.
 * @see https://react.dev/reference/react/Component#catching-rendering-errors-with-an-error-boundary
 */
export class ErrorBoundary extends Component<Props, State> {
  state = { error: null, errorInfo: null }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    // Having a componentDidCatch at all makes React treat this as a boundary, whatever
    // `catchErrors` says, so the error never reaches the global handler. Report before the
    // isEnabled check or a boundary set to "never" swallows the error without a trace.
    reportCrash(error, ErrorType.FATAL, errorInfo.componentStack)

    if (!this.isEnabled()) {
      return
    }
    this.setState({
      error,
      errorInfo,
    })
  }

  resetError = () => {
    this.setState({ error: null, errorInfo: null })
  }

  // Nothing but a new error changes what this renders
  shouldComponentUpdate(nextProps: Readonly<Props>, nextState: Readonly<State>): boolean {
    return nextState.error !== this.state.error
  }

  isEnabled(): boolean {
    return (
      this.props.catchErrors === "always" ||
      (this.props.catchErrors === "dev" && __DEV__) ||
      (this.props.catchErrors === "prod" && !__DEV__)
    )
  }

  render() {
    return this.isEnabled() && this.state.error ? (
      <ErrorDetails
        onReset={this.resetError}
        error={this.state.error}
        errorInfo={this.state.errorInfo}
      />
    ) : (
      this.props.children
    )
  }
}
