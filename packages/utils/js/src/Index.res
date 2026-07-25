@genType
module Logger = {
  let log = Logger.log
  let warn = Logger.warn
  let error = Logger.error
  let info = Logger.info

  module Production = {
    let log = Logger.Production.log
    let warn = Logger.Production.warn
    let error = Logger.Production.error
    let info = Logger.Production.info
  }
}
