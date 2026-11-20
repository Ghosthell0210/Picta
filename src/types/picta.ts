export interface PictaUser {
  id: number;
  username: string;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone_number?: string;
  avatar?: string;
  has_subscription?: boolean;
  total_downloads?: number;
  subscription_plan?: {
    id?: number;
    nombre?: string;
    descargas?: number;
    precio?: number;
  } | null;
  code?: string;
  dias_restantes?: number;
}

export interface PictaAuthSession {
  access_token: string;
  refresh_token: string;
  expires_in?: number;
  device_id?: string;
  profile_id?: string | number;
  user: PictaUser | null;
}

export interface PictaCanal {
  id: number;
  nombre: string;
  alias?: string;
  slug_url?: string;
  url_imagen?: string;
  url_avatar?: string;
  descripcion?: string;
  cantidad_suscripciones?: number;
  suscripcion?: boolean | number | null;
  donar?: boolean;
  publicado?: boolean;
  publicaciones_destacadas?: Array<{
    prioridad?: number;
    publicacion?: PictaPublicacion;
  }>;
}

export interface PictaCategoria {
  id?: number;
  tipologia?: {
    id?: number;
    nombre?: string;
    modelo?: string;
  };
  pelicula?: {
    ano?: number;
    pais?: string;
    director?: string;
    genero?: Array<{ nombre: string }> | string[];
  };
  serie?: {
    nombre?: string;
  };
  temporada?: {
    id?: number;
    nombre?: string;
    numero?: number;
  };
  capitulo?: {
    id?: number;
    numero?: number;
    temporada?: {
      id?: number;
      nombre?: string;
      numero?: number;
      serie?: PictaSerie;
    };
  };
  numero_capitulo?: number;
  live?: {
    finalizado?: boolean;
  };
}

export interface PictaPublicacion {
  id: number;
  nombre: string;
  tipo: string;
  slug_url: string;
  url_imagen: string;
  descripcion?: string;
  fecha_publicado?: string;
  fecha_creacion?: string;
  duracion?: string | number;
  url_manifiesto?: string;
  url_subtitulo?: string;
  url_descarga?: string;
  descarga?: string;
  descargable?: boolean;
  hd?: boolean;
  premium?: boolean;
  only_subs?: boolean;
  precios?: Array<{ tipo?: string; valor?: number }>;
  cantidad_visitas?: number;
  cantidad_reproducciones?: number;
  cantidad_me_gusta?: number;
  cantidad_no_me_gusta?: number;
  cantidad_comentarios?: number;
  cantidad_descargas?: number;
  mostrar_comentarios?: boolean;
  canal?: PictaCanal;
  categoria?: PictaCategoria;
  palabraClave_data?: Array<{ id?: number; nombre: string }>;
  lista_reproduccion_canal?: number[];
}

export interface PictaSerie {
  pelser_id: number;
  nombre: string;
  cantidad_temporadas?: number;
  cantidad_capitulos?: number;
  ano?: number;
  pais?: string;
  director?: string;
  reparto?: string;
  genero?: Array<{ id?: number; nombre: string }>;
  canal?: PictaCanal;
  last_update?: string;
  sinopsis?: string;
  clasificacion?: string;
  url_imagen?: string;
  imagen_secundaria?: string;
}

export interface PictaTemporada {
  id: number;
  nombre: string;
  numero: number;
  cantidad_capitulos?: number;
  serie?: number;
}

export interface PictaComentario {
  id: number;
  texto: string;
  fecha: string;
  comentario?: { id?: number } | number | null;
  cantidad_respuestas?: number;
  editado?: boolean;
  publicacion?: {
    id: number;
    nombre?: string;
    slug_url?: string;
  } | number;
  usuario?: {
    id?: number;
    username: string;
    avatar?: string;
  };
}

export interface PictaVoto {
  id: number;
  valor: boolean;
  fecha?: string;
}

export interface PictaSuscripcion {
  id: number;
  fecha?: string;
  recibir_notificacion?: boolean;
  canal: PictaCanal;
}

export interface PictaLista {
  id: number;
  nombre: string;
  tipo?: string;
  url_imagen?: string;
  fecha_creacion?: string;
  publicaciones?: number[];
  canal?: PictaCanal;
}

export interface PictaPaginatedResponse<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export interface LocalHistoryItem {
  video: PictaPublicacion;
  watchedAt: number;
  progressSeconds: number;
  durationSeconds: number;
}

export interface LocalDownloadItem {
  id: string;
  video: PictaPublicacion;
  quality: string;
  sizeLabel: string;
  url: string;
  createdAt: number;
}

export interface PictaGenero {
  id: number;
  nombre: string;
  tipo?: string;
}

export interface Mp4VariantOption {
  id: string;
  label: string;
  resolution?: string;
  bandwidth: number;
  estimatedSizeLabel?: string;
  url: string;
}

export interface Mp4AudioOption {
  id: string;
  label: string;
  language?: string;
  url: string;
  isDefault?: boolean;
}

export interface Mp4VariantsResponse {
  isLive: boolean;
  durationSeconds: number;
  variants: Mp4VariantOption[];
  audioTracks: Mp4AudioOption[];
}
