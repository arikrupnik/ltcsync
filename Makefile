

# default target: run tests

all: tests

tests: native_binaries \
	libSync/native_binary.run \
	libSync/ltc.run \
	libSync/media_file.run \
	libSync/sessions.run

%.run: %.js
	node $<

native_binaries: ltcdump ffmpeg

DOWNLOAD_DIR = build/downloads

# ffmpeg binaries:

ffmpeg: libSync/win32-x64-bin/ffmpeg.exe \
	libSync/win32-ia32-bin/ffmpeg.exe \
	libSync/darwin-x64-bin/ffmpeg \
	libSync/linux-x64-bin/ffmpeg \
	libSync/linux-ia32-bin/ffmpeg

libSync/win32-x64-bin/ffmpeg.exe:  URL=https://ffmpeg.zeranoe.com/builds/win64/static/ffmpeg-4.1-win64-static.zip
libSync/win32-ia32-bin/ffmpeg.exe: URL=https://ffmpeg.zeranoe.com/builds/win32/static/ffmpeg-4.1-win32-static.zip
libSync/darwin-x64-bin/ffmpeg:     URL=https://ffmpeg.zeranoe.com/builds/macos64/static/ffmpeg-4.1-macos64-static.zip
libSync/linux-x64-bin/ffmpeg:      URL=https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-amd64-static.tar.xz
libSync/linux-ia32-bin/ffmpeg:     URL=https://johnvansickle.com/ffmpeg/releases/ffmpeg-release-i686-static.tar.xz

libSync/win32-%-bin/ffmpeg.exe:
	mkdir -p $(DOWNLOAD_DIR)
	wget -nv -O $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.zip $(URL)
	mkdir -p $(@D)
	unzip -o -j $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.zip '*/bin/ffmpeg.exe'  -d $(@D)
	unzip -o -j $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.zip '*/bin/ffprobe.exe' -d $(@D)
libSync/darwin-x64-bin/ffmpeg:
	mkdir -p $(DOWNLOAD_DIR)
	wget -nv -O $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.zip $(URL)
	mkdir -p $(@D)
	unzip -o -j $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.zip '*/bin/ffmpeg'  -d $(@D)
	unzip -o -j $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.zip '*/bin/ffprobe' -d $(@D)
libSync/linux-%-bin/ffmpeg:
	mkdir -p $(DOWNLOAD_DIR)
	wget -nv -O $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.tar.xz $(URL)
	mkdir -p $(@D)
	tar -xvJf   $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.tar.xz -C $(@D) --wildcards '*/ffmpeg'  --transform='s:.*/::'
	tar -xvJf   $(DOWNLOAD_DIR)/$(notdir $(@D))-ffmpeg.tar.xz -C $(@D) --wildcards '*/ffprobe' --transform='s:.*/::'


# ltcdump binaries

ltcdump: libSync/win32-x64-bin/ltcdump.exe \
	libSync/win32-ia32-bin/ltcdump.exe \
	libSync/darwin-x64-bin/ltcdump \
	libSync/linux-x64-bin/ltcdump \
	libSync/linux-ia32-bin/ltcdump

LTCDUMP_VER = v0.7.0
LTCDUMP_ROOT = https://github.com/x42/ltc-tools/releases/download/$(LTCDUMP_VER)

libSync/win32-x64-bin/ltcdump.exe:  DESIGNATOR=w64
libSync/win32-ia32-bin/ltcdump.exe: DESIGNATOR=w32
libSync/darwin-x64-bin/ltcdump:     DESIGNATOR=mac-universal
libSync/linux-x64-bin/ltcdump:      DESIGNATOR=linux-x86_64
libSync/linux-ia32-bin/ltcdump:     DESIGNATOR=linux-i386

libSync/%-bin/ltcdump.exe:
	mkdir -p $(DOWNLOAD_DIR)
	wget -nv -O $(DOWNLOAD_DIR)/$(notdir $(@D))-ltcdump.zip $(LTCDUMP_ROOT)/ltcdump-$(DESIGNATOR)-$(LTCDUMP_VER).zip
	mkdir -p $(@D)
	unzip -o    $(DOWNLOAD_DIR)/$(notdir $(@D))-ltcdump.zip $(@F) -d $(@D)
libSync/%-bin/ltcdump:
	mkdir -p $(DOWNLOAD_DIR)
	wget -nv -O $(DOWNLOAD_DIR)/$(notdir $(@D))-ltcdump.zip $(LTCDUMP_ROOT)/ltcdump-$(DESIGNATOR)-$(LTCDUMP_VER).zip
	mkdir -p $(@D)
	unzip -o    $(DOWNLOAD_DIR)/$(notdir $(@D))-ltcdump.zip $(@F) -d $(@D)


# electron distributions

build/icon256.png: icon.svg
	for s in 16 32 64 128 256 512; do convert icon.svg -resize "$$s"x$s build/icon$$s.png; done
build/icon.ico: build/icon256.png
	convert $< $@
build/icon.icns: build/icon256.png
	cd build; png2icns icon.icns icon16.png icon32.png icon128.png icon256.png icon512.png
build/icon.png: build/icon256.png
	cp $< $@

electron: tests \
	build/LTCsync-win32-x64.zip \
	build/LTCsync-win32-ia32.zip \
	build/LTCsync-darwin-x64.zip \
	build/LTCsync-linux-x64.zip \
	build/LTCsync-linux-ia32.zip \
	build/samples.zip

ELECTRON_IGNORE = --ignore 'downloads' --ignore 'libSync/.*-.*-bin' --ignore '/samples' --ignore 'Makefile' --ignore '/.git*' --ignore '.travis.yml' --ignore 'icon.*.png'

build/LTCsync-win32-x64.zip: build/icon.ico
	electron-packager . --out build --overwrite $(ELECTRON_IGNORE) --platform win32  --arch x64  --icon $<
	rm $(basename $@)/LICENSE*
	cp -r libSync/win32-x64-bin  $(basename $@)/resources/app/libSync/
	cd build; zip -r ../$@ $(notdir $(basename $@))
build/LTCsync-win32-ia32.zip: build/icon.ico
	electron-packager . --out build --overwrite $(ELECTRON_IGNORE) --platform win32  --arch ia32 --icon $<
	rm $(basename $@)/LICENSE*
	cp -r libSync/win32-ia32-bin $(basename $@)/resources/app/libSync/
	cd build; zip -r ../$@ $(notdir $(basename $@))
build/LTCsync-darwin-x64.zip: build/icon.icns
	electron-packager . --out build --overwrite $(ELECTRON_IGNORE) --platform darwin --arch x64  --icon $<
	rm $(basename $@)/LICENSE*
	cp -r libSync/darwin-x64-bin $(basename $@)/LTCsync.app/Contents/Resources/app/libSync/
	cd build; zip -r ../$@ $(notdir $(basename $@))
build/LTCsync-linux-x64.zip: build/icon.png
	electron-packager . --out build --overwrite $(ELECTRON_IGNORE) --platform linux  --arch x64
	rm $(basename $@)/LICENSE*
	cp -r libSync/linux-x64-bin  $(basename $@)/resources/app/libSync/
	cp $< $(basename $@)/resources/app/
	cd build; zip -r ../$@ $(notdir $(basename $@))
build/LTCsync-linux-ia32.zip: build/icon.png
	electron-packager . --out build --overwrite $(ELECTRON_IGNORE) --platform linux  --arch ia32
	rm $(basename $@)/LICENSE*
	cp -r libSync/linux-ia32-bin $(basename $@)/resources/app/libSync/
	cp $< $(basename $@)/resources/app/
	cd build; zip -r ../$@ $(notdir $(basename $@))

build/samples.zip:
	zip -r $@ samples

clean:
	rm -rf build libSync/*-bin/

.PHONY: clean
