---
title: "[ES] Guía Sonarr + Radarr + Prwolarr + Jellyfin + Tailscale"
description: "Guía para instalar y configurar Sonarr, Radarr, Prwolarr, Jellyfin y algunos extras con Tailscale y Docker"
date: "Nov 27 2024"
---

## Introducción

> La batalla contra la piratería parecía ganada con la llegada del streaming, pero a las grandes corporaciones parece que no les bastaba con ganar y el streaming (de vídeo) se ha ido convirtiendo en un reino de taifas. Ahora tenemos decenas de servicios de streaming, cada año más caros, cuyos catálogos se encuentran fragmentados y sin garantías de continuidad. 

---

En esta guía aprenderemos a montar tu propio set de aplicaciones **arr* (Sonarr, Radarr) que se encargan de buscar diferentes tipos de archivos multimedia en indexadores torrent. 

Esos trackers/índices se gestionan de manera centralizada con *Prowlarr*. Los archivos se catalogarán y servirán con *Jellyfin*, un potente servidor multimedia open source. 

Como extra, añadiremos *Jellyseerr* que facilita la petición de nuevos archivos y un servidor *Samba* opcional para servir los archivos en bruto por red.

No vamos a exponer nada a Internet de forma directa, sino que crearemos una red privada virtual con Tailscale para acceder a nuestros servicios de forma segura y cifrada desde cualquier parte del mundo. 

![Diagrama de la red](/static/guia-arr/diagram.png)

## Requisitos

Doy por hecho que estás montando esto en Linux, pero debería ser muy parecido para Windows y Mac. 

Debemos tener instalado:

- Docker + Docker Compose. [+info](https://docs.docker.com/engine/install/)
- Tailscale [+info](https://tailscale.com/kb/1347/installation)


## docker-compose.yaml

```docker
services:
  transmission:
    image: linuxserver/transmission
    container_name: transmission
    restart: unless-stopped
    ports:
      - "9091:9091"
      - "51413:51413"
      - "51413:51413/udp"
    environment:
      # - TRANSMISSION_WEB_HOME=/config/transmissionic 
      - PUID=1000
      - PGID=1000
      - TZ=Europe/Madrid

    volumes:
      - /path_to_downloads/downloads:/downloads
      - /path_to_settings/transmission/config:/config
      - /path_to_settings/transmission/watch:/watch

  radarr:
    image: linuxserver/radarr:latest
    container_name: radarr
    restart: always
    ports:
      - "7878:7878"
    environment:
      - PGID=1000
      - PUID=1000
      - TZ=Europe/Madrid
    volumes:
      - /path_to_settings/radarr:/config
      - /path_to_downloads/movies:/movies
      - /path_to_downloads/downloads:/downloads

  sonarr:
    image: linuxserver/sonarr:latest
    container_name: sonarr
    restart: always
    ports:
      - "8989:8989"
    environment:
      - PGID=1000
      - PUID=1000
      - TZ=Europe/Madrid
    volumes:
      - /path_to_settings/sonarr:/config
      - /path_to_downloads/tv:/tv
      - /path_to_downloads/downloads:/downloads

  prowlarr:
    image: linuxserver/prowlarr:develop
    container_name: prowlarr
    restart: always
    ports:
      - "9696:9696"
    cap_add:
      - NET_ADMIN
    environment:
      - PGID=1000
      - PUID=1000
      - TZ=Europe/Madrid
    volumes:
      - /path_to_settings/prowlarr:/config
      - /path_to_settings/transmission/watch:/downloads # transmission watch directory

  flaresolverr:
    image: ghcr.io/flaresolverr/flaresolverr:latest
    container_name: flaresolverr
    environment:
      - LOG_LEVEL=warning
      - LOG_HTML=false
      - TZ=Europe/Madrid
    ports:
      - "8191:8191"
    restart: unless-stopped

  jellyfin:
    image: lscr.io/linuxserver/jellyfin:latest
    container_name: jellyfin
    environment:
      - PUID=1000
      - PGID=1000
      - TZ=Europe/Madrid
      - JELLYFIN_PublishedServerUrl=http://192.x.x.x #optional
      - # DOCKER_MODS=linuxserver/mods:jellyfin-opencl-intel # for intel gpu video acceleration
    volumes:
      - /path_to_settings/jellyfin:/config
      - /path_to_downloads/tv:/data/tvshows
      - /path_to_downloads/movies:/data/movies
    #group_add:
      #- "109" #for intel gpu video acceleration
    #devices:
      #- /dev/dri:/dev/dri # for video acceleration
    ports:
      - 8096:8096
      - 8920:8920 #optional
      - 7359:7359/udp #optional
      - 1900:1900/udp #optional
    restart: unless-stopped

  jellyseerr:
    image: fallenbagel/jellyseerr:latest
    container_name: jellyseerr
    environment:
      - LOG_LEVEL=warning
      - TZ=Europe/Madrid
      - PORT=5055 #optional
      - PUID=1000
      - PGID=1000
    ports:
      - 5055:5055
    volumes:
      - /path_to_settings/jellyseerr:/app/config
    restart: unless-stopped

   samba:
     image: dperson/samba:latest
     container_name: samba
     restart: always
     deploy:
       resources:
         limits:
           memory: 512M
     ports:
       - "139:139"
       - "445:445"
     environment:
       - USERID=1000
       - GROUPID=1000
       - SHARE=Media;/media
       - TZ=Europe/Madrid
     volumes:
       - /path_to_downloads:/media
```

## Explicación de las variables

En esta sección desglosamos las variables de configuración utilizadas en cada servicio del archivo `docker-compose.yaml`.

### Variables comunes

 **`PUID` y `PGID`** 

Especifican el ID de usuario y grupo del sistema operativo que ejecutará los contenedores. Esto asegura que los contenedores tengan los permisos adecuados para leer y escribir en los volúmenes montados y que no se ejecuten como `root` para evitar problemas.
  
Puedes encontrar tu PUID y PGID ejecutando:  

    ```bash
    id $(whoami)
    ```
**`TZ`**

Define la zona horaria del contenedor. 

Ejemplo: `Europe/Madrid`.

**`volumes`**  

Montaje de carpetas locales dentro de los contenedores.

El orden es `carpeta_local:carpeta_en_contenedor`.

  - `/path_to_settings/`: Carpeta donde se almacenan las configuraciones de los servicios. Yo la tengo en mi home, pero puedes ponerla donde quieras.
  - `/path_to_downloads/`: Carpeta donde se almacenan las descargas. Yo he montado un disco externo en `/media`, por tanto, `/media/dispositivo` sería la ruta completa. Dentro de esta carpeta, se creará una carpeta `downloads` para las descargas de Transmission. Cuando se complete una descarga, se copiará automáticamente a la carpeta correspondiente de películas o series.
  
  Puedes cambiar la ruta de `tv` y `movies` a donde quieras, pero asegúrate de que sea accesible por Jellyfin y los servicios de *arr.


---

### Servicio: **Transmission**

Transmission es un cliente BitTorrent con una interfaz web para gestionar las descargas. 

- `TRANSMISSION_WEB_HOME`
  - Ruta a la interfaz web personalizada de Transmission. Yo uso [Transmissionic](https://github.com/6c65726f79/Transmissionic). Colocas los archivos en `/config/tr ansmissionic` y descomentas la línea.

- **`ports`**:  
  - `9091`: Puerto para acceder a la interfaz web.  
  - `51413` (TCP/UDP): Puerto utilizado para las conexiones torrent.


He decidido usarlo sin VPN, pero puedes añadir una VPN fácilmente. Hay imágenes de Docker que incluyen todo lo necesario para ello, como esta [VPN Transmission](https://github.com/haugene/docker-transmission-openvpn). Cuidado porque la configuración y variables cambian.

---

### Servicio: **Radarr**

Radarr es un gestor de películas que automatiza la descarga y organización de películas.

- **`ports`**:  
  - `7878`: Puerto para la interfaz web de Radarr.
- **`volumes`**:  
  - `/config`: Carpeta donde Radarr almacena su configuración.  
  - `/movies`: Carpeta destino de las películas organizadas.  
  - `/downloads`: Carpeta de las descargas realizadas por Transmission.

---

### Servicio: **Sonarr**

Sonarr es un gestor de series que automatiza la descarga y organización de series, similar a Radarr. Gestiona también automáticamente los nuevos episodios.

- **`ports`**:  
  - `8989`: Puerto para la interfaz web de Sonarr.
- **`volumes`**:  
  - `/config`: Carpeta donde Sonarr almacena su configuración.  
  - `/tv`: Carpeta destino de las series organizadas.  
  - `/downloads`: Carpeta de las descargas realizadas por Transmission.

---

### Servicio: **Prowlarr**

Prowlarr es un gestor de indexadores que centraliza la búsqueda de torrents y la comunicación con los servicios *arr. También se pueden añadir índices Usenet, pero no vamos a meternos en ese jardín.

- **`ports`**:  
  - `9696`: Puerto para la interfaz web de Prowlarr.
- **`cap_add`**:  
  - Añade privilegios extra para controlar la red (`NET_ADMIN`).  
  - Necesario si configuras un proxy o VPN dentro del contenedor.
- **`volumes`**:  
  - `/config`: Carpeta donde Prowlarr almacena su configuración.  
  - `/downloads`: Monta el directorio de watch de Transmission.

---

### Servicio: **Flaresolverr**

Flaresolverr es un servicio de resolución de captchas (especialmente de Cloudflare). Es necesario para poder usar algunos indexadores públicos alojados tras Cloudflare.

- **`LOG_LEVEL`**:  
  Nivel de detalle del registro (logging). Puede ser `info`, `warning`, `error`, etc.  
- **`LOG_HTML`**:  
  Habilita o deshabilita el registro de respuestas HTML en los logs.  
  - Valor recomendado: `false`.  
- **`ports`**:  
  - `8191`: Puerto del proxy para resolver Cloudflare y otros desafíos.

---

### Servicio: **Jellyfin**

Jellyfin es un servidor multimedia. Puedes acceder a tus películas, series, música y fotos desde cualquier lugar. Es una alternativa gratuita a Plex.

Jellyfin se encarga de catalogar, obtener metadatos, carátulas... 

Además, puede codificar al vuelo para adaptarse a la velocidad de conexión del cliente o el formato de vídeo que soporta el dispositivo. Esta característica se llama *transcoding*.

El *transcoding* puede ser muy pesado para el servidor, por lo que es recomendable tener un hardware potente o una GPU compatible. Si es el caso, puedes activar la aceleración por hardware. Esto necesita algunas modificaciones en el contenedor, que se indican en la variable `DOCKER_MODS`.Tienes más información en la [página de linuxserver](https://docs.linuxserver.io/images/docker-jellyfin/#hardware-acceleration-enhancements).

- **`JELLYFIN_PublishedServerUrl`** *(opcional)*:  
  URL pública que se mostrará en las aplicaciones cliente de Jellyfin.  
  - Ejemplo: `http://192.168.x.x`.  
- **`DOCKER_MODS`** *(opcional)*:  
  Lista de modificaciones del contenedor (como compatibilidad con hardware específico).  
- **`volumes`**:  
  - `/config`: Configuración de Jellyfin.  
  - `/data/tvshows`: Carpeta donde Jellyfin buscará series.  
  - `/data/movies`: Carpeta donde Jellyfin buscará películas.  
- **`group_add`** y **`devices`**:  
    - Configuración para habilitar la aceleración de hardware.


---

### Servicio: **Jellyseerr**

Jellyseerr es un servidor web que facilita la petición de nuevos archivos a Sonarr y Radarr, con una interfaz web sencilla y catálogo de novedades.

- **`LOG_LEVEL`**:  
  Nivel de detalle del registro.  
- **`PORT`**:
  Puerto para acceder a la interfaz de Jellyseerr.
- **`volumes`**:  
  - `/app/config`: Carpeta para la configuración de Jellyseerr.

---

### Servicio: **Samba**

Samba es un servidor de archivos que permite compartir archivos en red con otros dispositivos.

- **`USERID` y `GROUPID`**:  
  Usuario y grupo con permisos sobre los archivos compartidos.  
- **`SHARE`**:  
  Define los recursos compartidos.  
  - Formato: `NombreDelRecurso;Ruta`.  
  - Ejemplo: `Media;/media`.
- **`volumes`**:  
  - `/media`: Carpeta local que se expondrá a la red.

Samba suele dar problemas con absolutamente todo (permisos, configuración, autenticación...) Esta imagen simplifica el proceso pero para cualquier problema, consulta la [documentación oficial](https://hub.docker.com/r/dperson/samba).

---

## Tailscale

Tailscale es servicio de red privada virtual (VPN) basado en WireGuard.  que permite conectar tus dispositivos de forma segura y cifrada. Es gratuito para uso personal.

- Crea una cuenta y una red en la [web de Tailscale](https://login.tailscale.com/admin).
- Instala Tailscale en todos los dispositivos que quieras conectar.
- Añade los dispositivos a la red.

Podrás acceder a los servicios de tu servidor desde cualquier parte del mundo, como si estuvieras en tu red local usando su dirección IP de la red de Tailscale (normalmente `100.x.x.x`).

---


## Configuración inicial: Prowlarr, Jellyfin y Jellyseerr

Para toda la configuración inicial, accede a la interfaz web de cada servicio en tu navegador. La dirección será `http://localhost:puerto` o `http://100.x.x.x:puerto` si estás usando Tailscale.

### Configuración de Prowlarr

Prowlarr es el componente central que se conecta a los indexadores y gestiona las búsquedas para Sonarr y Radarr. Sigue estos pasos para añadir indexadores:

1. **Accede a la interfaz de Prowlarr:**
   - Abre un navegador y ve a:  
     ```
     http://localhost:9696
     ```

2. **Añadir indexadores:**
   - Ve a **Indexers** en el menú principal.  
   - Haz clic en el botón **Add Indexer**.  
   - Selecciona el indexador que deseas añadir de la lista (ejemplo: **Rarbg**, **1337x**, etc.).  
   - Configura los campos requeridos:  
     - **API Key**: Si el indexador lo requiere, introduce tu clave API (normalmente obtenida en la web del indexador).  
   - Guarda los cambios y verifica que el indexador esté funcionando.

   ![Prowlarr Indexers](/static/guia-arr/prowlarr1.png)

3. **Obtener la API Key de Sonarr y Radarr:**
    - Ve a la interfaz de Sonarr y Radarr y obtén la API Key de cada servicio.
    - Para Sonarr: `http://localhost:8989`
    - Para Radarr: `http://localhost:7878`

En la interfaz de Sonarr y Radarr, ve a **Settings** > **General** > **Security** y copia la API Key de cada servicio.

![Sonarr API Key](/static/guia-arr/prowlarr2.png)

4. **Configurar Sonarr y Radarr:**
   - Ve a **Settings** > **Apps**.  
   - Haz clic en **Add Application** para añadir Sonarr y Radarr.  
     - Introduce la URL local de cada servicio (será el nombre del contenedor): 
       - Sonarr: `http://sonarr:8989`.  
       - Radarr: `http://radarr:7878`.  
     - Añade la API Key correspondiente en cada servicio.
   - Guarda los cambios.

---

### Configuración inicial de Jellyfin

Jellyfin es tu servidor multimedia. Una vez que el contenedor está en ejecución, puedes configurar tu cuenta y biblioteca.

1. **Accede a la interfaz de Jellyfin:**
   - Abre un navegador y ve a:  
     ```
     http://localhost:8096
     ```
   - Si estás en otra máquina, reemplaza `localhost` con la IP del servidor.

2. **Crear la cuenta de administrador:**
   - Al acceder por primera vez, Jellyfin te pedirá que crees una cuenta de administrador.  
   - Introduce un nombre de usuario y contraseña seguros.  
   - **Importante:** Esta cuenta tendrá control total sobre Jellyfin.

3. **Configurar bibliotecas:**
   - En el siguiente paso, Jellyfin te pedirá que configures tus bibliotecas de medios:  
     - **Películas**: Selecciona la carpeta donde Radarr almacena las películas (`/data/movies`).  
     - **Series**: Selecciona la carpeta donde Sonarr almacena las series (`/data/tvshows`).
   - Define el tipo de contenido para cada carpeta (ej.: `Películas`, `Series`).

4. **Configurar idioma y metadatos:**

5. **Finalizar configuración:**


---

### Configuración inicial de Jellyseerr

1. **Accede a la interfaz de Jellyseerr:**
   - Abre un navegador y ve a:  
     ```
     http://localhost:5055
     ```
   - Si estás en otra máquina, reemplaza `localhost` con la IP del servidor.

2. **Configura la conexión con Jellyfin:**
   - En la interfaz de Jellyseerr, ve a **Settings** > **Jellyfin**.
    - Introduce la URL de Jellyfin (`http://jellyfin:8096`).
    - Introduce el nombre de usuario y contraseña de Jellyfin o la API Key.
    - Guarda los cambios.

3. **Configura la conexión con Sonarr y Radarr:**
    - En la interfaz de Jellyseerr, ve a **Settings** > **Sonarr** y **Radarr**.
     - Introduce la URL de Sonarr y Radarr (`http://sonarr:8989` y `http://radarr:7878`).
     - Introduce la API Key de Sonarr y Radarr.
     - Guarda los cambios.

4. **Listo:**  
   - Ahora puedes acceder a Jellyseerr para solicitar nuevas películas y series.


---

## Uso 

Una vez que todos los servicios estén configurados, puedes olvidarte de la mayoría de ellos. Puedes entrar en Jellyseerr para solicitar nuevas películas o series, y en Jellyfin para ver tu contenido. 

## Notas finales

- **Seguridad**:

 No expongas tus servicios directamente a Internet. Utiliza Tailscale para acceder a ellos de forma segura y cifrada.

- **Transcoding**: 

Prueba diferentes configuraciones de Jellyfin para adaptar el *transcoding* a tus necesidades. Si tienes problemas de rendimiento, desactiva el *transcoding* o ajusta la calidad de transmisión.

- **Clientes**: 

Puedes acceder a Jellyfin desde cualquier dispositivo con un navegador web o usando las aplicaciones oficiales de Jellyfin para Android, iOS, Roku, etc. Yo uso Swiftin para iOS y iPad. Cuidado con el navegador que uses, porque algunos no soportan los codecs más modernos 4K, HDR, etc. 

- **Problemas**: 

Si tienes problemas con los servicios, consulta los registros de los contenedores (`docker logs nombre_del_contenedor`) o la documentación oficial de cada servicio.

- **Actualizaciones**: 

Asegúrate de mantener actualizados los contenedores y las imágenes de Docker. Puedes hacerlo fácilmente con `docker-compose pull` y `docker-compose up -d`.

- **Portainer**: 

Si te sientes más cómodo con una interfaz gráfica, puedes añadir portainer al `docker-compose.yaml` y acceder a él en `http://localhost:9000`. Portainer es un gestor de contenedores Docker con una interfaz web muy intuitiva.

- **Más información y guías avanzadas**: 

Puedes profundixar en la configuración de cada servicio con las guías de TRaSH, la comunidad de usuarios de *arr [TRaSH Guides](https://trash-guides.info/).