export const CARD_SCHEMA_DOC = `[
  {
    "cardId": "<existing-card-id or null>",
    "kind": "measure | chart",
    "titleBackground": {
      "title": "Card title"
    },
    "graph": {
      "chartType": "bar | line | pie | stackedbar",
      "barLayout": "grouped | stacked"
    },
    "axes": {
      "xLabel": "X axis label",
      "yLabel": "Y axis label"
    },
      "legend": {
        "seriesKey": "Optional column name used to derive multiple series (omit for single-series charts)"
      },
    "sql": {
      "code": "SELECT ...",
      "prompt": "User request that produced this card"
    }
  }
]`;
