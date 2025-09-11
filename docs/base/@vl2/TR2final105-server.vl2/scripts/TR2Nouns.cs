

datablock AudioProfile(TR2TestNounDataSound)
{
   volume = 2.0;
   filename    = "fx/bonuses/test-NounData-wildcat.wav";
   description = AudioBIGExplosion3d;
   preload = true;
};

// NounData components
// [Passer speed, grabber speed, grabber height]

$NounList = new ScriptObject() {
   class = NounList;
};

function NounList::get(%this, %a, %b, %c)
{
   return $NounList[%a, %b, %c];
}

$WaterNoun = new ScriptObject() {
   text = "Shark's";
   value = 2;
   sound = NounSharkSound;
   emitter = "Optional";
   class = NounData;
};

////////////////////////////////////////////////////////////////////////////////
// Ground passes
$NounList[0,0,0] = new ScriptObject() {
   text = "Llama's";
   value = -1;
   sound = NounLlamaSound;
   emitter = "Optional";
   class = NounData;
};

$NounList[1,0,0] = new ScriptObject() {
   text = "Turtle's";
   value = 1;
   sound = NounTurtleSound;
   emitter = "Optional";
   class = NounData;
};

$NounList[2,0,0] = new ScriptObject() {
   text = "Snake's";
   value = 2;
   sound = NounSnakeSound;
   class = NounData;
};

$NounList[3,0,0] = new ScriptObject() {
   text = "Iguana's";
   value = 3;
   sound = NounIguanaSound;
   class = NounData;
};

$NounList[0,1,0] = new ScriptObject() {
   text = "Puppy's";
   value = 2;
   sound = NounPuppySound;
   class = NounData;
};

$NounList[1,1,0] = new ScriptObject() {
   text = "Dog's";
   value = 3;
   sound = NounDogSound;
   class = NounData;
};

$NounList[2,1,0] = new ScriptObject() {
   text = "Coyote's";
   value = 4;
   sound = NounCoyoteSound;
   class = NounData;
};

$NounList[3,1,0] = new ScriptObject() {
   text = "Wolf's";
   value = 4;
   sound = NounWolfSound;
   class = NounData;
};

$NounList[0,2,0] = new ScriptObject() {
   text = "Donkey's";
   value = 2;
   sound = NounDonkeySound;
   class = NounData;
};

$NounList[1,2,0] = new ScriptObject() {
   text = "Cow's";
   value = 3;
   sound = NounCowSound;
   class = NounData;
};

$NounList[2,2,0] = new ScriptObject() {
   text = "Zebra's";
   value = 3;
   sound = NounZebraSound;
   class = NounData;
};

$NounList[3,2,0] = new ScriptObject() {
   text = "Horse's";
   value = 4;
   sound = NounHorseSound;
   class = NounData;
};

$NounList[0,3,0] = new ScriptObject() {
   text = "Tiger's";
   value = 3;
   sound = NounTigerSound;
   class = NounData;
};

$NounList[1,3,0] = new ScriptObject() {
   text = "Jaguar's";
   value = 4;
   sound = NounJaguarSound;
   class = NounData;
};

$NounList[2,3,0] = new ScriptObject() {
   text = "Cougar's";
   value = 5;
   sound = NounCougarSound;
   class = NounData;
};

$NounList[3,3,0] = new ScriptObject() {
   text = "Cheetah's";
   value = 6;
   sound = NounCheetahSound;
   class = NounData;
};

///////////////////////////////////////////////////////////////////////////////
// Low passes
$NounList[0,0,1] = new ScriptObject() {
   text = "Helicopter's";
   value = 2;
   sound = NounHelicopterSound;
   emitter = "Optional";
   class = NounData;
};

$NounList[1,0,1] = new ScriptObject() {
   text = "Grasshopper's";
   value = 3;
   sound = NounGrasshopperSound;
   emitter = "Optional";
   class = NounData;
};

$NounList[2,0,1] = new ScriptObject() {
   text = "Crow's";
   value = 3;
   sound = NounCrowSound;
   class = NounData;
};

$NounList[3,0,1] = new ScriptObject() {
   text = "Bee's";
   value = 4;
   sound = NounBeeSound;
   class = NounData;
};

$NounList[0,1,1] = new ScriptObject() {
   text = "Dragonfly's";
   value = 3;
   sound = NounDragonflySound;
   class = NounData;
};

$NounList[1,1,1] = new ScriptObject() {
   text = "Mosquito's";
   value = 4;
   sound = NounMosquitoSound;
   class = NounData;
};

$NounList[2,1,1] = new ScriptObject() {
   text = "Fly's";
   value = 4;
   sound = NounFlySound;
   class = NounData;
};

$NounList[3,1,1] = new ScriptObject() {
   text = "Parakeet's";
   value = 5;
   sound = NounParakeetSound;
   class = NounData;
};

$NounList[0,2,1] = new ScriptObject() {
   text = "Budgie's";
   value = 3;
   sound = NounBudgieSound;
   class = NounData;
};

$NounList[1,2,1] = new ScriptObject() {
   text = "Ostrich's";
   value = 4;
   sound = NounOstrichSound;
   class = NounData;
};

$NounList[2,2,1] = new ScriptObject() {
   text = "Wasp's";
   value = 4;
   sound = NounWaspSound;
   class = NounData;
};

$NounList[3,2,1] = new ScriptObject() {
   text = "Hornet's";
   value = 5;
   sound = NounHornetSound;
   class = NounData;
};

$NounList[0,3,1] = new ScriptObject() {
   text = "Bat's";
   value = 4;
   sound = NounBatSound;
   class = NounData;
};

$NounList[1,3,1] = new ScriptObject() {
   text = "Chickadee's";
   value = 5;
   sound = NounChickadeeSound;
   class = NounData;
};

$NounList[2,3,1] = new ScriptObject() {
   text = "Warnipple's";
   value = 10;
   sound = NounWarnippleSound;
   class = NounData;
};

$NounList[3,3,1] = new ScriptObject() {
   text = "Special's";
   value = 12;
   sound = NounSpecial1Sound;
   class = NounData;
};


////////////////////////////////////////////////////////////////////////////////
// Medium-high passes
$NounList[0,0,2] = new ScriptObject() {
   text = "Captain's";
   value = 4;
   sound = NounCaptainSound;
   emitter = "Optional";
   class = NounData;
};

$NounList[1,0,2] = new ScriptObject() {
   text = "Major's";
   value = 5;
   sound = NounMajorSound;
   emitter = "Optional";
   class = NounData;
};

$NounList[2,0,2] = new ScriptObject() {
   text = "Colonel's";
   value = 6;
   sound = NounColonelSound;
   class = NounData;
};

$NounList[3,0,2] = new ScriptObject() {
   text = "General's";
   value = 7;
   sound = NounGeneralSound;
   class = NounData;
};

$NounList[0,1,2] = new ScriptObject() {
   text = "Hurricane's";
   value = 5;
   sound = NounHurricaneSound;
   class = NounData;
};

$NounList[1,1,2] = new ScriptObject() {
   text = "Tornado's";
   value = 6;
   sound = NounHurricaneSound;
   class = NounData;
};

$NounList[2,1,2] = new ScriptObject() {
   text = "Dove's";
   value = 6;
   sound = NounDoveSound;
   class = NounData;
};

$NounList[3,1,2] = new ScriptObject() {
   text = "Flamingo's";
   value = 7;
   sound = NounFlamingoSound;
   class = NounData;
};

$NounList[0,2,2] = new ScriptObject() {
   text = "Goldfinch's";
   value = 6;
   sound = NounGoldfinchSound;
   class = NounData;
};

$NounList[1,2,2] = new ScriptObject() {
   text = "Owl's";
   value = 6;
   sound = NounOwlSound;
   class = NounData;
};

$NounList[2,2,2] = new ScriptObject() {
   text = "Pelican's";
   value = 7;
   sound = NounPelicanSound;
   class = NounData;
};

$NounList[3,2,2] = new ScriptObject() {
   text = "Jet's";
   value = 8;
   sound = NounJetSound;
   class = NounData;
};

$NounList[0,3,2] = new ScriptObject() {
   text = "Bluejay's";
   value = 7;
   sound = NounBluejaySound;
   class = NounData;
};

$NounList[1,3,2] = new ScriptObject() {
   text = "Swallow's";
   value = 7;
   sound = NounSwallowSound;
   class = NounData;
};

$NounList[2,3,2] = new ScriptObject() {
   text = "Joop's";
   value = 14;
   sound = NounSpecial2Sound;
   class = NounData;
};

$NounList[3,3,2] = new ScriptObject() {
   text = "Bluenose's";
   value = 16;
   sound = NounSpecial3Sound;
   class = NounData;
};

///////////////////////////////////////////////////////////////////////////////
// High passes
$NounList[0,0,3] = new ScriptObject() {
   text = "Astronaut's";
   value = 8;
   sound = NounAstronautSound;
   emitter = "Optional";
   class = NounData;
};

$NounList[1,0,3] = new ScriptObject() {
   text = "Cloud's";
   value = 9;
   sound = NounCloudSound;
   emitter = "Optional";
   class = NounData;
};

$NounList[2,0,3] = new ScriptObject() {
   text = "Atmosphere's";
   value = 10;
   sound = NounAtmosphereSound;
   class = NounData;
};

$NounList[3,0,3] = new ScriptObject() {
   text = "Moon's";
   value = 10;
   sound = NounMoonSound;
   class = NounData;
};

$NounList[0,1,3] = new ScriptObject() {
   text = "Ozone's";
   value = 9;
   sound = NounOzoneSound;
   class = NounData;
};

$NounList[1,1,3] = new ScriptObject() {
   text = "Balloon's";
   value = 10;
   sound = NounBalloonSound;
   class = NounData;
};

$NounList[2,1,3] = new ScriptObject() {
   text = "Blimp's";
   value = 11;
   sound = NounBlimpSound;
   class = NounData;
};

$NounList[3,1,3] = new ScriptObject() {
   text = "Zeppellin's";
   value = 12;
   sound = NounZeppellinSound;
   class = NounData;
};

$NounList[0,2,3] = new ScriptObject() {
   text = "Condor's";
   value = 11;
   sound = NounCondorSound;
   class = NounData;
};

$NounList[1,2,3] = new ScriptObject() {
   text = "Eagle's";
   value = 12;
   sound = NounBirdOfPreySound;
   class = NounData;
};

$NounList[2,2,3] = new ScriptObject() {
   text = "Hawk's";
   value = 13;
   sound = NounBirdOfPreySound;
   class = NounData;
};

$NounList[3,2,3] = new ScriptObject() {
   text = "Orlando's";
   value = 18;
   sound = NounSpecial1Sound;
   class = NounData;
};

$NounList[0,3,3] = new ScriptObject() {
   text = "Falcon's";
   value = 12;
   sound = NounBirdOfPreySound;
   class = NounData;
};

$NounList[1,3,3] = new ScriptObject() {
   text = "Jack's";
   value = 16;
   sound = NounSpecial2Sound;
   class = NounData;
};

$NounList[2,3,3] = new ScriptObject() {
   text = "Daunt's";
   value = 20;
   sound = NounSpecial3Sound;
   class = NounData;
};

$NounList[3,3,3] = new ScriptObject() {
   text = "Natural's";
   value = 22;
   sound = NounSpecial1Sound;
   class = NounData;
};
