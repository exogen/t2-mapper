

//datablock AudioProfile(TR2TestQualifierDataSound)
//{
//   filename    = "fx/bonuses/test-QualifierData-brilliance.wav";
//   description = AudioBIGExplosion3d;
//   preload = true;
//};

// QualifierData components
// [Horizontal flag speed, Vertical flag speed, hangtime]

$QualifierList = new ScriptObject() {
   class = QualifierList;
};

function QualifierList::get(%this, %a, %b, %c)
{
   return $QualifierList[%a, %b, %c];
}

////////////////////////////////////////////////////////////////////////////////
//  No/low hangtime
$QualifierList[0,0,0] = "";
//new ScriptObject() {
//   text = "Dull";
//   value = 5;
//   sound = "blah.wav";
//   emitter = "Optional";
//   class = QualifierData;
//};

$QualifierList[1,0,0] = new ScriptObject() {
   text = "Sharp";
   value = 1;
   sound = Qualifier100Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[0,1,0] = new ScriptObject() {
   text = "Spitting";
   value = 1;
   sound = Qualifier010Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[1,1,0] = new ScriptObject() {
   text = "Whipped";
   value = 2;
   sound = Qualifier110Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[0,2,0] = new ScriptObject() {
   text = "Popping";
   value = 2;
   sound = Qualifier020Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[1,2,0] = new ScriptObject() {
   text = "Bursting";
   value = 3;
   sound = Qualifier120Sound;
   emitter = "Optional";
   class = QualifierData;
};

////////////////////////////////////////////////////////////////////////////////
//  Medium hangtime
$QualifierList[0,0,1] = new ScriptObject() {
   text = "Modest";
   value = 3;
   sound = Qualifier001Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[1,0,1] = new ScriptObject() {
   text = "Ripped";
   value = 4;
   sound = Qualifier101Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[0,1,1] = new ScriptObject() {
   text = "Shining";
   value = 4;
   sound = Qualifier011Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[1,1,1] = new ScriptObject() {
   text = "Slick";
   value = 5;
   sound = Qualifier111Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[0,2,1] = new ScriptObject() {
   text = "Sprinkling";
   value = 5;
   sound = Qualifier021Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[1,2,1] = new ScriptObject() {
   text = "Brilliant";
   value = 6;
   sound = Qualifier121Sound;
   emitter = "Optional";
   class = QualifierData;
};

////////////////////////////////////////////////////////////////////////////////
//  High hangtime
$QualifierList[0,0,2] = new ScriptObject() {
   text = "Frozen";
   value = 7;
   sound = Qualifier002Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[1,0,2] = new ScriptObject() {
   text = "Shooting";
   value = 8;
   sound = Qualifier102Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[0,1,2] = new ScriptObject() {
   text = "Dangling";
   value = 9;
   sound = Qualifier012Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[1,1,2] = new ScriptObject() {
   text = "Blazing";
   value = 10;
   sound = Qualifier112Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[0,2,2] = new ScriptObject() {
   text = "Raining";
   value = 11;
   sound = Qualifier022Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[1,2,2] = new ScriptObject() {
   text = "Falling";
   value = 12;
   sound = Qualifier122Sound;
   emitter = "Optional";
   class = QualifierData;
};

////////////////////////////////////////////////////////////////////////////////
//  Wow hangtime
$QualifierList[0,0,3] = new ScriptObject() {
   text = "Suspended";
   value = 13;
   sound = Qualifier003Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[1,0,3] = new ScriptObject() {
   text = "Skeeting";
   value = 14;
   sound = Qualifier103Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[0,1,3] = new ScriptObject() {
   text = "Hanging";
   value = 15;
   sound = Qualifier013Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[1,1,3] = new ScriptObject() {
   text = "Arcing";
   value = 16;
   sound = Qualifier113Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[0,2,3] = new ScriptObject() {
   text = "Pouring";
   value = 17;
   sound = Qualifier023Sound;
   emitter = "Optional";
   class = QualifierData;
};

$QualifierList[1,2,3] = new ScriptObject() {
   text = "Elite";
   value = 18;
   sound = Qualifier123Sound;
   emitter = "Optional";
   class = QualifierData;
};
