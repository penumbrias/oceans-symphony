// Nature sounds — field recordings from Freesound, streamed from the
// project's GitHub release so none of the audio ships inside the app.
// Only this list (names, places, tags, credits) is bundled.
//
// Every file is CC0 unless `licence` says otherwise; CC BY recordings must
// keep their credit on the Credits page (NatureCreditsPage). To add a
// sound: encode it to 96 kbps CBR stereo MP3 named ns-<freesound id>.mp3,
// upload it to the NATURE_RELEASE_TAG release, then add its row here.

export const NATURE_RELEASE_TAG = "nature-sounds-v1";
const BASE = `https://github.com/penumbrias/oceans-symphony/releases/download/${NATURE_RELEASE_TAG}`;

export const natureSoundUrl = (id) => `${BASE}/ns-${id}.mp3`;
export const freesoundUrl = (id) => `https://freesound.org/s/${id}/`;

export const LICENCES = {
  CC0: { label: "CC0", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  "CC-BY-4.0": { label: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
};

// Tag ids in the order the filter shows them.
export const NATURE_TAGS = [
  ["rain", "Rain"], ["thunder", "Thunder"], ["waves", "Waves"], ["water", "Water"],
  ["birds", "Birds"], ["dawn", "Dawn"], ["night", "Night"], ["forest", "Forest"],
  ["wind", "Wind"], ["frogs", "Frogs"], ["insects", "Insects"], ["animals", "Animals"],
  ["leaves", "Leaves"], ["winter", "Winter"], ["city", "Town"], ["calm", "Calm"],
  ["binaural", "Binaural"],
].map(([id, label]) => ({ id, label }));

// seconds: the length of the hosted file (a guide for sorting; the player
// reads the real length from the file).
export const NATURE_SOUNDS = [
  {"id": "350279", "title": "Long, quiet thunderstorm", "place": "Pécel, Hungary", "tags": ["thunder", "rain", "calm"], "seconds": 12173, "by": "csengeri", "original": "2016071402zivatar.mp3", "licence": "CC0"},
  {"id": "736986", "title": "Calm May rain", "place": "Pécel, Hungary", "tags": ["rain", "calm"], "seconds": 11781, "by": "csengeri", "original": "23rd of May 2024 rain", "licence": "CC0"},
  {"id": "249411", "title": "September rainfall", "place": "Pécel, Hungary", "tags": ["rain", "thunder", "calm", "city"], "seconds": 10577, "by": "csengeri", "original": "14th September 2014 rainfall", "licence": "CC0"},
  {"id": "853184", "title": "Heron colony at evening, part 2", "place": "", "tags": ["birds", "water"], "seconds": 10503, "by": "nicola_ariutti", "original": "garzaia_Pt2", "licence": "CC0"},
  {"id": "853183", "title": "Heron colony at evening, part 1", "place": "", "tags": ["birds", "water"], "seconds": 10503, "by": "nicola_ariutti", "original": "garzaia_Pt1", "licence": "CC0"},
  {"id": "860205", "title": "June evening in town", "place": "Pécel, Hungary", "tags": ["city", "birds"], "seconds": 8709, "by": "csengeri", "original": "June 25 evening in Pécel, Hungary", "licence": "CC0"},
  {"id": "319845", "title": "Morning thunderstorm", "place": "Pécel, Hungary", "tags": ["thunder", "rain", "calm"], "seconds": 8311, "by": "csengeri", "original": "16th of August 2015 morning thunderstorm, Pécel, Hungary", "licence": "CC0"},
  {"id": "394600", "title": "Rain and occasional thunder", "place": "", "tags": ["rain", "thunder", "calm"], "seconds": 7335, "by": "Simon Spiers", "original": "Rain and ocasional thunder.mp3", "licence": "CC0"},
  {"id": "662108", "title": "Riverside morning", "place": "Haughton Green, UK", "tags": ["water", "birds", "calm", "city"], "seconds": 4582, "by": "Sadiquecat", "original": "2022 12 01 10h29 UK Haughtongreen Rivermead road ambiance.flac", "licence": "CC0"},
  {"id": "839784", "title": "Morning bird concert", "place": "Haar, Germany", "tags": ["birds", "dawn", "calm"], "seconds": 4176, "by": "danfloyd", "original": "A beautiful morning concert by birds - 16.04.2017 - Haar - Germany", "licence": "CC0"},
  {"id": "563802", "title": "Frozen lake from a dock", "place": "", "tags": ["winter", "water", "calm", "city"], "seconds": 4052, "by": "boyscontentclub", "original": "Frozen Lake Ambience Recorded on a Dock near a Road.mp3", "licence": "CC0"},
  {"id": "853157", "title": "Midnight bird bath with wind chimes", "place": "US west coast", "tags": ["night", "wind", "binaural", "water"], "seconds": 3680, "by": "lonemonk", "original": "Leftcoast @ Midnight: Bird Bath with Wind & Chimes - Ambisonically Dervied Binaural (1st Order)", "licence": "CC0"},
  {"id": "420919", "title": "Toads and frogs by the river at night", "place": "Tefé river, Amazonas, Brazil", "tags": ["frogs", "night", "water", "forest"], "seconds": 3615, "by": "felix.blume", "original": "Toads and Frogs during the night on the edge of the river", "licence": "CC0"},
  {"id": "859942", "title": "Brazilian woods birds", "place": "Gonçalves, Brazil", "tags": ["birds", "forest"], "seconds": 223, "by": "pa_909", "original": "ambient_brazilianwoods_goncalves_birds_hammeringonthebackground-for_a_time", "licence": "CC0"},
  {"id": "403764", "title": "Autumn wind in the trees", "place": "", "tags": ["wind", "forest"], "seconds": 220, "by": "straget", "original": "Autumn wind grabbs the trees.wav", "licence": "CC0"},
  {"id": "835730", "title": "Ravens in the redwoods", "place": "Eureka, California, US", "tags": ["birds", "forest", "animals"], "seconds": 216, "by": "CVLTIV8R", "original": "Ravens in Redwoods Forest, Caws, Wings Batting, Spectral Isolated", "licence": "CC0"},
  {"id": "348120", "title": "Summer night storm in the countryside", "place": "Romania", "tags": ["thunder", "rain", "night"], "seconds": 24641, "by": "marlo1981", "original": "Summer night storm at the country side", "licence": "CC0"},
  {"id": "150175", "title": "Spring peepers and coyotes at midnight", "place": "Stonefort, Illinois, US", "tags": ["frogs", "night", "animals", "water"], "seconds": 61, "by": "kvgarlic", "original": "LateNightPeepersandCoyotesMarch302012.wav", "licence": "CC0"},
  {"id": "636844", "title": "Soft steps through dry leaves", "place": "Mount Coot-tha, Queensland, Australia", "tags": ["leaves", "forest"], "seconds": 61, "by": "Alex_hears_things", "original": "Soft walking through very dry leaves and twigs.wav", "licence": "CC0"},
  {"id": "202042", "title": "Autumn woods", "place": "Jyväskylä, Finland", "tags": ["forest", "birds"], "seconds": 61, "by": "leimu", "original": "jkl_woods.wav", "licence": "CC0"},
  {"id": "446019", "title": "Gentle stream", "place": "Scottish Borders, UK", "tags": ["water", "calm"], "seconds": 63, "by": "BurghRecords", "original": "Gentle Stream Natural Stream Sound", "licence": "CC0"},
  {"id": "560292", "title": "Night at the forest pond", "place": "Dresden, Germany", "tags": ["night", "water", "forest", "frogs"], "seconds": 66, "by": "TheParappa", "original": "Forest ambience 3 (night at the pond)", "licence": "CC0"},
  {"id": "646558", "title": "Indigo bunting and vireo", "place": "Shawnee National Forest, Illinois, US", "tags": ["birds", "forest"], "seconds": 67, "by": "kvgarlic", "original": "IndigoBunting WhiteEyed Vireo AUG 6 2022 Tom cabin D100.WAV", "licence": "CC0"},
  {"id": "395689", "title": "Afternoon birds in the woods", "place": "Den Dolder, Netherlands", "tags": ["birds", "forest"], "seconds": 71, "by": "hz37", "original": "Woods lage vuursche birds afternoon March 2010", "licence": "CC0"},
  {"id": "847011", "title": "Walking on leaves", "place": "", "tags": ["leaves", "forest"], "seconds": 215, "by": "SMKoski02", "original": "Grunau_QuetLeafs", "licence": "CC0"},
  {"id": "451743", "title": "Tropical island waves", "place": "Alif Alif, Maldives", "tags": ["waves", "calm"], "seconds": 470, "by": "richwise", "original": "Tropical Island", "licence": "CC0"},
  {"id": "752377", "title": "Waves on a pebble beach", "place": "Saint-Aubin-sur-Mer, France", "tags": ["waves", "calm"], "seconds": 492, "by": "kevp888", "original": "R4_00677_FR_Waves_on_pebble_beach", "licence": "CC-BY-4.0"},
  {"id": "470647", "title": "Waves on the beach", "place": "Gylly Beach, Falmouth, UK", "tags": ["waves", "calm"], "seconds": 938, "by": "ralph.whitehead", "original": "Waves On The Beach.wav", "licence": "CC0"},
  {"id": "818830", "title": "Rock cove waves with meadow pipit", "place": "", "tags": ["waves", "birds"], "seconds": 1007, "by": "Sandy-Ogilvie", "original": "Rock cove in interdial zone, close waves, distant crashing waves, occasional meadow pipit", "licence": "CC0"},
  {"id": "866570", "title": "West coast beach", "place": "Sooke, BC, Canada", "tags": ["waves", "binaural"], "seconds": 1073, "by": "lonemonk", "original": "Westcoast Beach: 3Dio Binaural", "licence": "CC0"},
  {"id": "688065", "title": "Waves and boats in Venice", "place": "Venice, Italy", "tags": ["waves", "city"], "seconds": 1425, "by": "saorenjoyer", "original": "Waves and Boats in Venice", "licence": "CC0"},
  {"id": "785566", "title": "Small waves over sand and shells", "place": "Seacliff, East Lothian, Scotland", "tags": ["waves", "calm"], "seconds": 1455, "by": "Sandy-Ogilvie", "original": "Small waves washing over and through sand, shells and shingle", "licence": "CC0"},
  {"id": "815320", "title": "Early morning boardwalk with crickets", "place": "Oyster Bay, Gulf Shores, Alabama, US", "tags": ["water", "insects", "dawn", "calm"], "seconds": 1560, "by": "treytatum3", "original": "AMBSea-Summer_early morning water lapping against boardwalk in Oyster Bay, wind, crickets, distant siren, 615AM_QCF_Gulf Shores Alabama_Zoom F3 with LCT 440 Pure", "licence": "CC0"},
  {"id": "176786", "title": "Eastern Oregon wildlife", "place": "Wasco, Oregon, US", "tags": ["birds", "animals"], "seconds": 202, "by": "conleec", "original": "AMB_S_Ext_Eastern_Oregon_Wildlife6.wav", "licence": "CC0"},
  {"id": "633817", "title": "Frogs and geese in a swamp", "place": "Limburg, Netherlands", "tags": ["frogs", "birds", "water"], "seconds": 506, "by": "DBlover", "original": "Frogs and geese in a swamp", "licence": "CC0"},
  {"id": "866412", "title": "Howler monkeys at El Tintal", "place": "Petén, Guatemala", "tags": ["animals", "forest"], "seconds": 1393, "by": "pulseczar42", "original": "Howler Monkeys at El Tintal", "licence": "CC0"},
  {"id": "519519", "title": "Dawn chorus, Europe", "place": "Europe", "tags": ["birds", "dawn"], "seconds": 12600, "by": "secondharmonicgeneration", "original": "Dawn Chorus Project Part 3 - Europe.mp3", "licence": "CC0"},
  {"id": "609155", "title": "Thirty-minute thunderstorm", "place": "", "tags": ["thunder", "rain"], "seconds": 1684, "by": "doom.blu", "original": "30min_Thunderstorm.wav", "licence": "CC0"},
  {"id": "661594", "title": "Rain on the car", "place": "", "tags": ["rain", "calm"], "seconds": 1744, "by": "Tom_Kaszuba", "original": "Rain inside car.", "licence": "CC0"},
  {"id": "383506", "title": "Pinewood", "place": "Helvoirt, Netherlands", "tags": ["forest", "birds", "calm"], "seconds": 1760, "by": "klankbeeld", "original": "Pinewood In Memoriam - Febr 05 NL Giersbergen -33dB 170215_1085.flac", "licence": "CC0"},
  {"id": "446212", "title": "Nightingales", "place": "Billigheim, Germany", "tags": ["birds", "night"], "seconds": 1828, "by": "BlueDelta", "original": "Nightingales - concert of several Nightingales in QUADRO.wav", "licence": "CC0"},
  {"id": "698108", "title": "City beach at night", "place": "", "tags": ["waves", "night", "city"], "seconds": 1861, "by": "Morphic__", "original": "City Beach at Night", "licence": "CC0"},
  {"id": "575652", "title": "Thunderstorm coming into town", "place": "Leipzig, Germany", "tags": ["thunder", "rain", "city"], "seconds": 1861, "by": "Garuda1982", "original": "approaching thunderstorm in small town sound effect", "licence": "CC0"},
  {"id": "273673", "title": "Birds in Decatur", "place": "Decatur, Georgia, US", "tags": ["birds"], "seconds": 1925, "by": "microdac", "original": "Sounds recorded in Decatur Georgia", "licence": "CC0"},
  {"id": "255674", "title": "Early spring thunderstorm with birdsong", "place": "Greensboro, North Carolina, US", "tags": ["thunder", "rain", "birds", "dawn"], "seconds": 2061, "by": "the_toilet_guy", "original": "early morning spring thunderstorm with birdsong", "licence": "CC0"},
  {"id": "815394", "title": "Morning birdsong", "place": "Marata, Barcelona, Spain", "tags": ["birds", "dawn"], "seconds": 2166, "by": "frederic.font", "original": "20250611 6h Marata de matí", "licence": "CC0"},
  {"id": "687457", "title": "Dawn chorus in the south of France", "place": "Sospel, France", "tags": ["birds", "dawn"], "seconds": 2170, "by": "saorenjoyer", "original": "Dawn Chorus in Southern France", "licence": "CC0"},
  {"id": "238833", "title": "Distant thunderstorm", "place": "Pécel, Hungary", "tags": ["thunder", "calm"], "seconds": 2220, "by": "csengeri", "original": "27th of May 2014 distant thunderstorm", "licence": "CC0"},
  {"id": "636993", "title": "Birds and a passing train", "place": "Bologna, Italy", "tags": ["birds", "city", "binaural"], "seconds": 2200, "by": "cinoz_recordings", "original": "birds train binaural", "licence": "CC0"},
  {"id": "173497", "title": "Winter swamp", "place": "Moerputten, Netherlands", "tags": ["winter", "water", "birds"], "seconds": 2173, "by": "klankbeeld", "original": "swamp January Moerputten NL 130108_00.flac", "licence": "CC0"},
  {"id": "335698", "title": "Storm coming through the forest", "place": "", "tags": ["thunder", "wind", "forest"], "seconds": 2301, "by": "kvitkrull", "original": "Approaching storm in the forest", "licence": "CC0"},
  {"id": "864448", "title": "Dawn chorus at Sweet Springs", "place": "Los Osos, California, US", "tags": ["birds", "dawn"], "seconds": 2560, "by": "eccoci", "original": "dawn chorus - sweet springs - 4.20.26", "licence": "CC0"},
  {"id": "159321", "title": "Heavy city thunderstorm", "place": "Warsaw, Poland", "tags": ["thunder", "rain", "city"], "seconds": 2475, "by": "unfa", "original": "Heavy Urban Thunderstorm", "licence": "CC0"},
  {"id": "637015", "title": "Thunder, rain, birds and a train", "place": "Bologna, Italy", "tags": ["thunder", "rain", "birds", "city", "binaural"], "seconds": 2610, "by": "cinoz_recordings", "original": "thunder rain birds train binaural", "licence": "CC0"},
  {"id": "243001", "title": "Thunder and rain", "place": "Turku, Finland", "tags": ["thunder", "rain"], "seconds": 2619, "by": "claudius9uk", "original": "thunder_rain_turku_1.flac", "licence": "CC0"},
  {"id": "692859", "title": "Thunderstorm with hail", "place": "Szczecin, Poland", "tags": ["thunder", "rain"], "seconds": 3600, "by": "twiciasty", "original": "Thunderstorm and Hail, Szczecin, Poland, 26.06.2023, ~ 4 P.M", "licence": "CC0"},
  {"id": "536679", "title": "Night thunder and rain", "place": "Veracruz, Mexico", "tags": ["thunder", "rain", "night"], "seconds": 3600, "by": "felix.blume", "original": "Thunder & Rain in Veracruz during the night (1 hour)", "licence": "CC0"},
  {"id": "341671", "title": "Rain shower", "place": "Pécel, Hungary", "tags": ["rain", "calm"], "seconds": 4577, "by": "csengeri", "original": "29th March 2016 rain shower over Pécel", "licence": "CC0"},
  {"id": "294441", "title": "Thunderstorm arriving", "place": "Pécel, Hungary", "tags": ["thunder", "rain"], "seconds": 3293, "by": "csengeri", "original": "8th of July 2015 thunderstorm arrival to Pécel, Hungary", "licence": "CC0"},
  {"id": "721591", "title": "Waves at the beach", "place": "Ashburton, New Zealand", "tags": ["waves", "calm"], "seconds": 2726, "by": "Desmond178", "original": "waves at the beach", "licence": "CC0"},
  {"id": "815393", "title": "Night in the countryside", "place": "Marata, Barcelona, Spain", "tags": ["night", "insects"], "seconds": 2668, "by": "frederic.font", "original": "20250608 23h Marata de nit", "licence": "CC0"},
  {"id": "416995", "title": "Birds at the feeder", "place": "", "tags": ["birds"], "seconds": 2650, "by": "straget", "original": "Birds around birdfeeding with two OM1 from Line-audio.mp3", "licence": "CC0"},
  {"id": "647300", "title": "Summer night", "place": "East Lyme, Connecticut, US", "tags": ["night", "insects"], "seconds": 2623, "by": "hotemogf", "original": "220814_010 Night Sounds.WAV", "licence": "CC0"},
  {"id": "678948", "title": "Pond and lake at dawn", "place": "Northern Wisconsin, US", "tags": ["water", "birds", "dawn"], "seconds": 3600, "by": "filipmu", "original": "pond and lake-2023-02-03--06-03-38-854.wav", "licence": "CC0"},
  {"id": "536915", "title": "Cicadas in summer", "place": "South of France", "tags": ["insects"], "seconds": 3600, "by": "felix.blume", "original": "Cicada during summer in South of France (1 hour)", "licence": "CC0"},
  {"id": "346288", "title": "Afternoon thunderstorm", "place": "Pécel, Hungary", "tags": ["thunder", "rain"], "seconds": 6740, "by": "csengeri", "original": "24th MAy 2016 afternoon thunderstorm", "licence": "CC0"},
  {"id": "530123", "title": "Quarrelling foxes", "place": "UK", "tags": ["animals", "night"], "seconds": 325, "by": "naturenotesuk", "original": "Quarrelling Foxes", "licence": "CC0"},
  {"id": "173865", "title": "Cawing crows", "place": "", "tags": ["birds", "animals"], "seconds": 268, "by": "conleec", "original": "ANML_M_Ext_Crows_Flock_Angry2.wav", "licence": "CC0"},
  {"id": "486418", "title": "Oyster Cove", "place": "Putalina, Tasmania, Australia", "tags": ["water", "birds", "calm"], "seconds": 3619, "by": "Hanbaal", "original": "Oyster Cove, Tasmania. Stereo Field-Recording.", "licence": "CC0"},
  {"id": "681832", "title": "Town waking up before dawn", "place": "Warren, Michigan, US", "tags": ["city", "birds", "dawn"], "seconds": 7200, "by": "Ambient-X", "original": "City of Warren Waking Up On Palm Sunday 520am to 720am 4-2-23.flac", "licence": "CC0"},
  {"id": "701139", "title": "Suburban early evening", "place": "Orpington, London, UK", "tags": ["city", "birds"], "seconds": 4843, "by": "nlux", "original": "Suburban Early Evening Ambience", "licence": "CC0"},
  {"id": "738063", "title": "Night thunderstorm", "place": "Pécel, Hungary", "tags": ["thunder", "rain", "night"], "seconds": 3946, "by": "csengeri", "original": "31st May 2024 thunderstorm at night", "licence": "CC0"},
  {"id": "432166", "title": "Thunderstorm", "place": "Pécel, Hungary", "tags": ["thunder", "rain"], "seconds": 7632, "by": "csengeri", "original": "9th June 2018 thunderstorm part 1", "licence": "CC0"},
  {"id": "391486", "title": "Approaching thunderstorm", "place": "Pécel, Hungary", "tags": ["thunder", "rain"], "seconds": 7859, "by": "csengeri", "original": "5th May 2017 approaching thunderstorm", "licence": "CC0"}

];

export const natureSoundById = (id) => NATURE_SOUNDS.find((s) => s.id === id) || null;
