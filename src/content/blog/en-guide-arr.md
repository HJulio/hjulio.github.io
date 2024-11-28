---
title: "[EN] Sonarr + Radarr + Prowlarr + Jellyfin + Tailscale Guide"
description: "Guide to install and configure Sonarr, Radarr, Prowlarr, Jellyfin and some extras with Tailscale and Docker"
date: "Nov 28 2024"
---

## Introduction

> The battle against piracy seemed won with the arrival of streaming, but the large corporations didn't seem satisfied with winning, and video streaming has become a fragmented landscape. Now we have dozens of streaming services, getting more expensive every year, with fragmented catalogs and no guarantee of continuity.

This guide will teach you how to set up your own suite of "arr*" applications (Sonarr, Radarr) that search for different types of multimedia files on torrent indexers.

These trackers/indexes are managed centrally with *Prowlarr*.  The files will be cataloged and served with *Jellyfin*, a powerful open-source media server.

As extras, we'll add *Jellyseerr*, which facilitates requesting new files, and an optional *Samba* server to serve raw files over the network.

We won't expose anything directly to the internet; instead, we'll create a virtual private network with Tailscale to securely and encryptedly access our services from anywhere in the world.

![Network Diagram](/static/guia-arr/diagram.png)

## Requirements

I assume you're setting this up on Linux, but it should be very similar for Windows and Mac.

You must have installed:

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

## Variable Explanation

This section breaks down the configuration variables used in each service of the `docker-compose.yaml` file.

### Common Variables

#### **`PUID` and `PGID`**

Specify the user and group ID of the operating system that will run the containers. This ensures that the containers have the appropriate permissions to read and write to the mounted volumes and that they do not run as `root` to avoid problems.

You can find your PUID and PGID by running:

```bash
    id $(whoami)
```

#### **`TZ`**

Defines the time zone of the container.

Example: `Europe/Madrid`.

#### **`volumes`**

Mounting local folders inside the containers.

The order is `local_folder:container_folder`.

- `/path_to_settings/`: Folder where the service configurations are stored. I have it in my home, but you can put it wherever you want.
- `/path_to_downloads/`: Folder where downloads are stored. I have mounted an external drive in `/media`, so `/media/device` would be the full path. Inside this folder, a `downloads` folder will be created for Transmission downloads. When a download is complete, it will be automatically copied to the corresponding movie or series folder.

You can change the path of `tv` and `movies` to wherever you want, but make sure it's accessible by Jellyfin and the *arr* services.


---

### Service: **Transmission**

Transmission is a BitTorrent client with a web interface to manage downloads.

- `TRANSMISSION_WEB_HOME`
  - Path to the custom Transmission web interface. I use [Transmissionic](https://github.com/6c65726f79/Transmissionic). Place the files in `/config/transmissionic` and uncomment the line.

- **`ports`**:
  - `9091`: Port to access the web interface.
  - `51413` (TCP/UDP): Port used for torrent connections.

I have decided to use it without a VPN, but you can easily add a VPN. There are Docker images that include everything you need, like this [VPN Transmission](https://github.com/haugene/docker-transmission-openvpn). Be careful because the configuration and variables change.

---

### Service: **Radarr**

Radarr is a movie manager that automates the download and organization of movies.

- **`ports`**:
  - `7878`: Port for the Radarr web interface.
- **`volumes`**:
  - `/config`: Folder where Radarr stores its configuration.
  - `/movies`: Destination folder for organized movies.
  - `/downloads`: Folder for downloads made by Transmission.

---

### Service: **Sonarr**

Sonarr is a series manager that automates the download and organization of series, similar to Radarr. It also automatically manages new episodes.

- **`ports`**:
  - `8989`: Port for the Sonarr web interface.
- **`volumes`**:
  - `/config`: Folder where Sonarr stores its configuration.
  - `/tv`: Destination folder for organized series.
  - `/downloads`: Folder for downloads made by Transmission.

---

### Service: **Prowlarr**

Prowlarr is an indexer manager that centralizes the search for torrents and communication with the *arr* services. Usenet indexes can also be added, but we won't get into that.

- **`ports`**:
  - `9696`: Port for the Prowlarr web interface.
- **`cap_add`**:
  - Adds extra privileges to control the network (`NET_ADMIN`).
  - Necessary if you configure a proxy or VPN within the container.
- **`volumes`**:
  - `/config`: Folder where Prowlarr stores its configuration.
  - `/downloads`: Mounts the Transmission watch directory.

---

### Service: **Flaresolverr**

Flaresolverr is a captcha solving service (especially for Cloudflare). It is necessary to be able to use some public indexers hosted behind Cloudflare.

- **`LOG_LEVEL`**:
  Log detail level. Can be `info`, `warning`, `error`, etc.
- **`LOG_HTML`**:
  Enables or disables logging of HTML responses in the logs.
  - Recommended value: `false`.
- **`ports`**:
  - `8191`: Proxy port for resolving Cloudflare and other challenges.

---

### Service: **Jellyfin**

Jellyfin is a media server. You can access your movies, series, music, and photos from anywhere. It's a free alternative to Plex.

It also handles cataloging, metadata retrieval, cover art, etc.

Additionally, it can transcode on the fly to adapt to the client's connection speed or the video format supported by the device. This feature is called *transcoding*.

*Transcoding* can be very demanding on the server, so it is recommended to have powerful hardware or a compatible GPU. If this is the case, you can enable hardware acceleration. This requires some modifications to the container, which are indicated in the `DOCKER_MODS` variable. You can find more information on the [linuxserver page](https://docs.linuxserver.io/images/docker-jellyfin/#hardware-acceleration-enhancements).


- **`JELLYFIN_PublishedServerUrl`** *(optional)*:
  Public URL that will be displayed in Jellyfin client applications.
  - Example: `http://192.168.x.x`.
- **`DOCKER_MODS`** *(optional)*:
  List of container modifications (such as compatibility with specific hardware).
- **`volumes`**:
  - `/config`: Jellyfin configuration.
  - `/data/tvshows`: Folder where Jellyfin will look for series.
  - `/data/movies`: Folder where Jellyfin will look for movies.
- **`group_add`** and **`devices`**:
  - Configuration to enable hardware acceleration.

---

### Service: **Jellyseerr**

Jellyseerr is a web server that facilitates the request of new files to Sonarr and Radarr, with a simple web interface and catalog of new releases.

- **`LOG_LEVEL`**:
  Log detail level.
- **`PORT`**:
  Port to access the Jellyseerr interface.
- **`volumes`**:
  - `/app/config`: Folder for Jellyseerr configuration.

---

### Service: **Samba**

Samba is a file server that allows you to share files over a network with other devices.

- **`USERID` and `GROUPID`**:
  User and group with permissions on the shared files.
- **`SHARE`**:
  Defines the shared resources.
  - Format: `ResourceName;Path`.
  - Example: `Media;/media`.
- **`volumes`**:
  - `/media`: Local folder that will be exposed to the network.

Samba often has problems with absolutely everything (permissions, configuration, authentication...). This image simplifies the process, but for any problems, consult the [official documentation](https://hub.docker.com/r/dperson/samba).

---

## Tailscale

Tailscale is a virtual private network (VPN) service based on WireGuard that allows you to securely and encryptedly connect your devices. It's free for personal use.

- Create an account and a network on the [Tailscale website](https://login.tailscale.com/admin).
- Install Tailscale on all the devices you want to connect.
- Add the devices to the network.

You will be able to access your server's services from anywhere in the world, as if you were on your local network using its Tailscale network IP address (usually `100.x.x.x`).

---

## Initial Configuration: Prowlarr, Jellyfin, and Jellyseerr

For all initial configuration, access the web interface of each service in your browser. The address will be `http://localhost:port` or `http://100.x.x.x:port` if you are using Tailscale.

### Prowlarr Configuration

Prowlarr is the central component that connects to indexers and manages searches for Sonarr and Radarr. Follow these steps to add indexers:

#### Access the Prowlarr interface

- Open a browser and go to:

```bash
    http://localhost:9696
```

#### Add indexers

- Go to **Indexers** in the main menu.
- Click the **Add Indexer** button.
- Select the indexer you want to add from the list (example: **Rarbg**, **1337x**, etc.).
- Configure the required fields:
  - **API Key**: If the indexer requires it, enter your API key (usually obtained from the indexer's website).
- Save the changes and verify that the indexer is working.

![Prowlarr Indexers](/static/guia-arr/prowlarr1.png)

#### Obtain the Sonarr and Radarr API Keys

- Go to the Sonarr and Radarr interfaces and obtain the API key for each service.
  - For Sonarr: `http://localhost:8989`
  - For Radarr: `http://localhost:7878`
- In the Sonarr and Radarr interface, go to **Settings** > **General** > **Security** and copy the API key for each service.

#### Configure Sonarr and Radarr

- Go to **Settings** > **Apps**.
- Click **Add Application** to add Sonarr and Radarr.
  - Enter the local URL of each service (it will be the container name):
    - Sonarr: `http://sonarr:8989`.
    - Radarr: `http://radarr:7878`.
  - Add the corresponding API key in each service.
- Save the changes.
![Sonarr API Key](/static/guia-arr/prowlarr2.png)

---

### Initial Jellyfin Configuration

Jellyfin is your media server. Once the container is running, you can configure your account and library.

#### Access the Jellyfin interface

- Open a browser and go to:

```bash
http://localhost:8096
```

#### Create the administrator account

- Upon first access, Jellyfin will ask you to create an administrator account.
- Enter a secure username and password.
- **Important:** This account will have total control over Jellyfin.

#### Configure libraries

- In the next step, Jellyfin will ask you to configure your media libraries:
  - **Movies**: Select the folder where Radarr stores the movies (`/data/movies`).
  - **TV Shows**: Select the folder where Sonarr stores the series (`/data/tvshows`).
- Define the content type for each folder (e.g., `Movies`, `TV Shows`).

You would then configure the language and metadata retrieval and it would be ready.

---

### Initial Jellyseerr Configuration

#### Access the Jellyseerr interface

- Open a browser and go to:

```bash
http://localhost:5055
```

- If you are on another machine, replace `localhost` with the server's IP.

#### Configure the connection with Jellyfin

- In the Jellyseerr interface, go to **Settings** > **Jellyfin**.
  - Enter the Jellyfin URL (`http://jellyfin:8096`).
  - Enter the Jellyfin username and password or the API key.
  - Save the changes.

#### Configure the connection with Sonarr and Radarr

- In the Jellyseerr interface, go to **Settings** > **Sonarr** and **Radarr**.
  - Enter the Sonarr and Radarr URLs (`http://sonarr:8989` and `http://radarr:7878`).
  - Enter the Sonarr and Radarr API keys.
  - Save the changes.

#### Ready

- You can now access Jellyseerr to request new movies and series.

---

## Usage

Once all services are configured, you can forget about most of them. You can go to Jellyseerr to request new movies or series, and to Jellyfin to watch your content.

## Final Notes

- **Storage**:

The \*arr applications copy completed downloads to the movies and series folders. The original file remains in the Transmission downloads folder and helps to share it on the bittorrent network. Consider deleting these completed downloads from time to time to free up space. This will not affect the movies and series in your libraries.

There are methods to avoid copying, such as hardlinking, which creates a symbolic link instead of copying the file. This can be useful if you have limited disk space.

It is also important to review the rules of private trackers, if you add them, to avoid issues with upload and download ratios and the minimum seeding time. I assume that if you are on a private tracker, you already know about these rules.

- **Security**: Do not expose your services directly to the internet. Use Tailscale to access them securely and encryptedly.

- **Transcoding**: Test different Jellyfin configurations to adapt transcoding to your needs. If you have performance problems, disable transcoding or adjust the streaming quality.

- **Clients**: You can access Jellyfin from any device with a web browser or using the official Jellyfin apps for Android, iOS, Roku, etc. I use Swiftin for iOS and iPad. Be careful with the browser you use, because some do not support the most modern codecs 4K, HDR, etc.

- **Troubleshooting**: If you have problems with the services, check the container logs (`docker logs container_name`) or the official documentation of each service.

- **Updates**: Make sure to keep the containers and Docker images updated. You can do this easily with `docker-compose pull` and `docker-compose up -d`.

- **Portainer**: If you are more comfortable with a graphical interface, you can add Portainer to the `docker-compose.yaml` and access it at `http://localhost:9000`. Portainer is a Docker container manager with a very intuitive web interface.

- **More information and advanced guides**: You can delve deeper into the configuration of each service with the TRaSH guides, the *arr* user community [TRaSH Guides](https://trash-guides.info/).