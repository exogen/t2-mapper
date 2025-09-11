
// Misc.
datablock AudioProfile(CrowdClapSound)
{
   volume = 1.0;
   filename    = "fx/misc/crowd-clap.wav";
   description = Audio2D;
};

datablock AudioProfile(CrowdDisappointment1Sound)
{
   volume = 1.0;
   filename    = "fx/misc/missed.wav";
   description = Audio2D;
};

datablock AudioProfile(CrowdCheer1Sound)
{
   volume = 1.0;
   filename    = "fx/misc/cheer.wav";
   description = Audio2D;
};

datablock AudioProfile(CrowdFlairSound)
{
   volume = 1.0;
   filename = "fx/misc/flair.wav";
   description = Audio2D;
};

// Bonus sound profiles

// Assorted
datablock AudioProfile(MarioSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/mario-6notes.wav";
   description = Audio2D;
};

datablock AudioProfile(GameStartSound)
{
   volume = 1.0;
   filename    = "fx/misc/gamestart.wav";
   description = Audio2D;
};

datablock AudioProfile(GadgetSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/gadget3.wav";
   description = Audio2D;
};

datablock AudioProfile(EvilLaughSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/evillaugh.wav";
   description = AudioBigExplosion3D;
};

datablock AudioProfile(RoleChangeSound)
{
   volume = 1.0;
   filename    = "fx/misc/rolechange.wav";
   description = AudioExplosion3D;
};

//datablock AudioProfile(InterceptionFriendlySound)
//{
//   volume = 1.0;
//   filename    = "fx/misc/nexus_cap";
//   description = Audio2D;
//};

//datablock AudioProfile(InterceptionEnemySound)
//{
//   volume = 1.0;
//   filename    = "fx/misc/flag_taken.wav";
//   description = Audio2D;
//};

datablock AudioProfile(CarScreechSound)
{
   volume = 1.0;
   filename    = "fx/misc/carscreech.wav";
   description = AudioBigExplosion3D;
};

datablock AudioProfile(SlapshotSound)
{
   volume = 1.0;
   filename    = "fx/misc/slapshot.wav";
   description = Audio2D;
};

datablock AudioProfile(CoinSound)
{
   volume = 1.0;
   filename    = "fx/misc/coin.wav";
   description = AudioBigExplosion3D;
};

datablock AudioProfile(MA1Sound)
{
   volume = 1.0;
   filename    = "fx/misc/MA1.wav";
   description = Audio2D;
};

datablock AudioProfile(MA2Sound)
{
   volume = 1.0;
   filename    = "fx/misc/MA2.wav";
   description = Audio2D;
};

datablock AudioProfile(MA3Sound)
{
   volume = 1.0;
   filename    = "fx/misc/MA3.wav";
   description = Audio2D;
};


datablock AudioProfile(MonsterSound)
{
   volume = 1.0;
   filename     = "fx/Bonuses/TRex.wav";
   description = AudioBigExplosion3D;
};

datablock AudioProfile(CrowdLoop1Sound)
{
   volume = 1.0;
   filename     = "fx/misc/crowd.wav";
   description = AudioLooping2D;
};

datablock AudioProfile(CrowdLoop2Sound)
{
   volume = 1.0;
   filename     = "fx/misc/crowd2.wav";
   description = AudioLooping2D;
};

datablock AudioProfile(CrowdLoop3Sound)
{
   volume = 1.0;
   filename     = "fx/misc/crowd3.wav";
   description = AudioLooping2D;
};

datablock AudioProfile(CrowdTransition1aSound)
{
   volume = 1.0;
   filename    = "fx/misc/crowdtransition1a.wav";
   description = Audio2D;
};
datablock AudioProfile(CrowdTransition1bSound)
{
   volume = 1.0;
   filename    = "fx/misc/crowdtransition1b.wav";
   description = Audio2D;
};

datablock AudioProfile(CrowdTransition2aSound)
{
   volume = 1.0;
   filename    = "fx/misc/crowdtransition2a.wav";
   description = Audio2D;
};

datablock AudioProfile(CrowdTransition2bSound)
{
   volume = 1.0;
   filename    = "fx/misc/crowdtransition2b.wav";
   description = Audio2D;
};

datablock AudioProfile(CrowdTransition3aSound)
{
   volume = 1.0;
   filename    = "fx/misc/crowdtransition3a.wav";
   description = Audio2D;
};

datablock AudioProfile(CrowdTransition3bSound)
{
   volume = 1.0;
   filename    = "fx/misc/crowdtransition3b.wav";
   description = Audio2D;
};

datablock AudioProfile(CrowdFadeSound)
{
   volume = 1.0;
   filename    = "fx/misc/crowdfade.wav";
   description = Audio2D;
};

$TR2::CrowdLoopTransitionUp[0] = CrowdTransition1aSound;
$TR2::CrowdLoop[0] = CrowdLoop1Sound;
$TR2::CrowdLoopTransitionDown[0] = CrowdTransition1bSound;
$TR2::CrowdLoopTransitionUp[1] = CrowdTransition2aSound;
$TR2::CrowdLoop[1] = CrowdLoop2Sound;
$TR2::CrowdLoopTransitionDown[1] = CrowdTransition2bSound;
$TR2::CrowdLoopTransitionUp[2] = CrowdTransition3aSound;
$TR2::CrowdLoop[2] = CrowdLoop3Sound;
$TR2::CrowdLoopTransitionDown[2] = CrowdTransition3bSound;
$TR2::NumCrowdLevels = 3;


// Creativity
datablock AudioProfile(Creativity1Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/qseq1.wav";
   description = Audio2D;
};

datablock AudioProfile(Creativity2Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/qseq2.wav";
   description = Audio2D;
};

datablock AudioProfile(Creativity3Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/qseq3.wav";
   description = Audio2D;
};


// Nouns
datablock AudioProfile(NounDogSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/dog.wav";
   description = Audio2D;
};

datablock AudioProfile(NounHorseSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/horse.wav";
   description = Audio2D;
};

datablock AudioProfile(NounWolfSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/wolf.wav";
   description = Audio2D;
};

datablock AudioProfile(NounInsect1Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/insect1.wav";
   description = Audio2D;
};

datablock AudioProfile(NounInsect2Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/insect2.wav";
   description = Audio2D;
};

datablock AudioProfile(NounAstronautSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/astronaut.wav";
   description = Audio2D;
};

datablock AudioProfile(NounAtmosphereSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/atmosphere.wav";
   description = Audio2D;
};

datablock AudioProfile(NounBalloonSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/balloon.wav";
   description = Audio2D;
};

datablock AudioProfile(NounBatSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/bats.wav";
   description = Audio2D;
};

datablock AudioProfile(NounBeeSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/beeswarm.wav";
   description = Audio2D;
};

datablock AudioProfile(NounBirdOfPreySound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/birdofprey.wav";
   description = Audio2D;
};

datablock AudioProfile(NounBlimpSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/blimp.wav";
   description = Audio2D;
};

datablock AudioProfile(NounBluejaySound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/bluejay.wav";
   description = Audio2D;
};

datablock AudioProfile(NounBudgieSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/budgie.wav";
   description = Audio2D;
};

datablock AudioProfile(NounButterlySound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/butterfly.wav";
   description = Audio2D;
};

datablock AudioProfile(NounCamelSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/camel.wav";
   description = Audio2D;
};

datablock AudioProfile(NounCaptainSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/captain.wav";
   description = Audio2D;
};

datablock AudioProfile(NounCatSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/cat.wav";
   description = Audio2D;
};

datablock AudioProfile(NounCheetahSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/cheetah.wav";
   description = Audio2D;
};

datablock AudioProfile(NounChickadeeSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/chickadee.wav";
   description = Audio2D;
};

datablock AudioProfile(NounCloudSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/cloud.wav";
   description = Audio2D;
};

datablock AudioProfile(NounColonelSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/colonel.wav";
   description = Audio2D;
};

datablock AudioProfile(NounCondorSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/condor.wav";
   description = Audio2D;
};

datablock AudioProfile(NounCougarSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/cougar.wav";
   description = Audio2D;
};

datablock AudioProfile(NounCowSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/cow.wav";
   description = Audio2D;
};

datablock AudioProfile(NounCoyoteSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/coyote.wav";
   description = Audio2D;
};

datablock AudioProfile(NounDonkeySound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/donkey.wav";
   description = Audio2D;
};

datablock AudioProfile(NounDoveSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/dove.wav";
   description = Audio2D;
};

datablock AudioProfile(NounDragonflySound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/dragonfly.wav";
   description = Audio2D;
};

datablock AudioProfile(NounFishSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/fish.wav";
   description = Audio2D;
};

datablock AudioProfile(NounFlamingoSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/flamingo.wav";
   description = Audio2D;
};

datablock AudioProfile(NounFlySound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/fly.wav";
   description = Audio2D;
};

datablock AudioProfile(NounGeneralSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/general.wav";
   description = Audio2D;
};

datablock AudioProfile(NounGoldfinchSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/goldfinch.wav";
   description = Audio2D;
};

datablock AudioProfile(NounGrasshopperSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/grasshopper.wav";
   description = Audio2D;
};

datablock AudioProfile(NounHornetSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/hornet.wav";
   description = Audio2D;
};

datablock AudioProfile(NounHelicopterSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/helicopter.wav";
   description = Audio2D;
};

datablock AudioProfile(NounHurricaneSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/hurricane.wav";
   description = Audio2D;
};

datablock AudioProfile(NounIguanaSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/iguana.wav";
   description = Audio2D;
};

datablock AudioProfile(NounJaguarSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/jaguar.wav";
   description = Audio2D;
};

datablock AudioProfile(NounJetSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/airplane.wav";
   description = Audio2D;
};

datablock AudioProfile(NounLlamaSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/llama.wav";
   description = Audio2D;
};

datablock AudioProfile(NounMajorSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/major.wav";
   description = Audio2D;
};

datablock AudioProfile(NounMoonSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/moon.wav";
   description = Audio2D;
};

datablock AudioProfile(NounCrowSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/crow.wav";
   description = Audio2D;
};

datablock AudioProfile(NounMosquitoSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/msquito.wav";
   description = Audio2D;
};

datablock AudioProfile(NounOstrichSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/ostrich.wav";
   description = Audio2D;
};

datablock AudioProfile(NounOwlSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/Owl.wav";
   description = Audio2D;
};

datablock AudioProfile(NounOzoneSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/ozone.wav";
   description = Audio2D;
};

datablock AudioProfile(NounParakeetSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/parakeet.wav";
   description = Audio2D;
};

datablock AudioProfile(NounParrotSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/parrot.wav";
   description = Audio2D;
};

datablock AudioProfile(NounPelicanSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/pelican.wav";
   description = Audio2D;
};

datablock AudioProfile(NounPuppySound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/puppy.wav";
   description = Audio2D;
};

datablock AudioProfile(NounSharkSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/shark.wav";
   description = Audio2D;
};

datablock AudioProfile(NounSnakeSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/snake.wav";
   description = Audio2D;
};

datablock AudioProfile(NounSwallowSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/Swallow.wav";
   description = Audio2D;
};

datablock AudioProfile(NounTigerSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/tiger.wav";
   description = Audio2D;
};

datablock AudioProfile(NounTornadoSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/tornado.wav";
   description = Audio2D;
};

datablock AudioProfile(NounTurtleSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/turtle.wav";
   description = Audio2D;
};

datablock AudioProfile(NounWarnippleSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/warnipple.wav";
   description = Audio2D;
};

datablock AudioProfile(NounWaspSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/wasp.wav";
   description = Audio2D;
};

datablock AudioProfile(NounZebraSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/zebra.wav";
   description = Audio2D;
};

datablock AudioProfile(NounZeppellinSound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/zeppellin.wav";
   description = Audio2D;
};

datablock AudioProfile(NounSpecial1Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/Special1.wav";
   description = Audio2D;
};

datablock AudioProfile(NounSpecial2Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/Special2.wav";
   description = Audio2D;
};

datablock AudioProfile(NounSpecial3Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/Nouns/Special3.wav";
   description = Audio2D;
};

datablock AudioProfile(NounGrowlSound)
{
   volume = 1.0;
   filename    = "fx/environment/growl4.wav";
   description = Audio2D;
};

datablock AudioProfile(NounWindSound)
{
   volume = 1.0;
   filename    = "fx/environment/moaningwind1.wav";
   description = Audio2D;
};

datablock AudioProfile(NounBird1Sound)
{
   volume = 1.0;
   filename    = "fx/environment/bird_echo1.wav";
   description = Audio2D;
};

datablock AudioProfile(NounBird2Sound)
{
   volume = 1.0;
   filename    = "fx/environment/bird_echo5.wav";
   description = Audio2D;
};




// Qualifiers
datablock AudioProfile(Qualifier100Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/low-level1-sharp.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier010Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/low-level2-spitting.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier110Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/low-level3-whipped.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier020Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/low-level4-popping.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier120Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/low-level5-bursting.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier001Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/med-level1-modest.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier101Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/med-level2-ripped.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier011Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/med-level3-shining.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier111Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/med-level4-slick.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier021Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/med-level5-sprinkling";
   description = Audio2D;
};

datablock AudioProfile(Qualifier121Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/med-level6-brilliant.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier002Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/high-level1-frozen.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier102Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/high-level2-shooting.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier012Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/high-level3-dangling.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier112Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/high-level4-blazing.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier022Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/high-level5-raining.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier122Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/high-level6-falling.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier003Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/wow-level1-suspended.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier103Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/wow-level2-skeeting.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier013Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/wow-level3-hanging.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier113Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/wow-level4-arcing.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier023Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/wow-level5-pouring.wav";
   description = Audio2D;
};

datablock AudioProfile(Qualifier123Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/wow-level6-elite.wav";
   description = Audio2D;
};


// Descriptions
datablock AudioProfile(Description000Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/horz_straipass1_bullet.wav";
   description = Audio2D;
};

datablock AudioProfile(Description001Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/horz_straipass2_heist.wav";
   description = Audio2D;
};

datablock AudioProfile(Description002Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/horz_straipass3_smackshot.wav";
   description = Audio2D;
};

datablock AudioProfile(Description010Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/horz_passback1_jab.wav";
   description = Audio2D;
};

datablock AudioProfile(Description011Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/horz_passback2_backbreaker.wav";
   description = Audio2D;
};

datablock AudioProfile(Description012Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/horz_passback3_leetlob.wav";
   description = Audio2D;
};

datablock AudioProfile(Description020Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/horz_perppass1_peeler.wav";
   description = Audio2D;
};

datablock AudioProfile(Description021Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/horz_perppass2_blender.wav";
   description = Audio2D;
};

datablock AudioProfile(Description022Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/horz_perppass3_glasssmash.wav";
   description = Audio2D;
};

datablock AudioProfile(Description100Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/upward_straipass1_ascension.wav";
   description = Audio2D;
};

datablock AudioProfile(Description101Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/upward_straipass2_elevator.wav";
   description = Audio2D;
};

datablock AudioProfile(Description102Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/upward_straipass3_rainbow.wav";
   description = Audio2D;
};

datablock AudioProfile(Description110Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/upward_passback1_bomb.wav";
   description = Audio2D;
};

datablock AudioProfile(Description111Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/upward_passback2_deliverance.wav";
   description = Audio2D;
};

datablock AudioProfile(Description112Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/upward_passback3_crank.wav";
   description = Audio2D;
};

datablock AudioProfile(Description120Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/upward_perppass1_fling.wav";
   description = Audio2D;
};

datablock AudioProfile(Description121Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/upward_perppass2_quark.wav";
   description = Audio2D;
};

datablock AudioProfile(Description122Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/upward_perppass3_juggletoss.wav";
   description = Audio2D;
};

datablock AudioProfile(Description200Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/down_straipass1_yoyo.wav";
   description = Audio2D;
};

datablock AudioProfile(Description201Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/down_straipass2_skydive.wav";
   description = Audio2D;
};

datablock AudioProfile(Description202Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/down_straipass3_jolt.wav";
   description = Audio2D;
};

datablock AudioProfile(Description210Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/down_passback1_prayer.wav";
   description = Audio2D;
};

datablock AudioProfile(Description211Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/down_passback2_moyoyo.wav";
   description = Audio2D;
};

datablock AudioProfile(Description212Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/down_passback3_rocket.wav";
   description = Audio2D;
};

datablock AudioProfile(Description220Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/down_perppass1_blast.wav";
   description = Audio2D;
};

datablock AudioProfile(Description221Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/down_perppass2_deepdish.wav";
   description = Audio2D;
};

datablock AudioProfile(Description222Sound)
{
   volume = 1.0;
   filename    = "fx/bonuses/down_perppass3_bunnybump.wav";
   description = Audio2D;
};

