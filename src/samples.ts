import { buildPostmanShareUrl } from './postman/postmanImport';

export interface Sample {
  label: string;
  sublabel: string;
  /** Build the viewer URL to navigate to when this sample is chosen. */
  href: (pathname: string) => string;
}

// A gist-hosted OpenCollection. Using the bare gist id (the `gist` param) lets
// the gist API pick the YAML file, so the sample works without a raw file path.
const GIST_ID = '6037ec28edf197eeb11b09606fda7371';

// A public Postman collection plus one of its environments.
const PM_COLLECTION = 'https://www.postman.com/microsoftgraph/microsoft-graph/collection/zzaccpr/microsoft-graph';
const PM_ENVIRONMENT =
  'https://www.postman.com/microsoftgraph/microsoft-graph/environment/455214-efbc69b2-69bd-402e-9e72-850b3a49bb21';

// A public OpenAPI 3.0 spec (converted to OpenCollection in the browser). Loaded
// via the dedicated `openapi_url` slot so the format is declared upfront.
const OPENAPI_SPEC = 'https://petstore3.swagger.io/api/v3/openapi.json';

export const SAMPLES: Sample[] = [
  {
    label: 'Hotel Booking API',
    sublabel: 'https://gist.github.com/abhishek-bruno/6037ec28edf197eeb11b09606fda7371',
    href: (pathname) => `${pathname}?gist=${GIST_ID}`
  },
  {
    label: 'Swagger Petstore (OpenAPI)',
    sublabel: OPENAPI_SPEC,
    href: (pathname) => `${pathname}?openapi_url=${encodeURIComponent(OPENAPI_SPEC)}`
  },
  {
    label: 'Microsoft Graph',
    sublabel: 'https://www.postman.com/microsoftgraph/microsoft-graph/collection/zzaccpr/microsoft-graph',
    href: (pathname) => buildPostmanShareUrl(pathname, PM_COLLECTION, [PM_ENVIRONMENT])
  }
];
