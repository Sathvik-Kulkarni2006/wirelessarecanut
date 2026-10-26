#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <HTTPClient.h>

// ===== Wi-Fi: enter your mobile hotspot credentials =====
const char* WIFI_SSID = "YOUR_HOTSPOT_NAME";
const char* WIFI_PASSWORD = "YOUR_HOTSPOT_PASSWORD";

// ===== Render backend =====
const char* SERVER_URL = "https://arecanutproject1.onrender.com/api/readings";
// Must exactly match DEVICE_API_KEY in Render Environment settings.
// Use a NEW secret key; do not share it publicly.
const char* DEVICE_API_KEY = "REPLACE_WITH_YOUR_NEW_SECRET_KEY";

// This board reports Row 1. For another board, change to "row2".
const char* DEVICE_ID = "row1";

// Sensor analog output connected to ESP32 GPIO 34
const int SENSOR_PIN = 34;
const int SAMPLES = 10;

// Calibrate using your own sensor: dry soil raw value and wet soil raw value.
// Typical values are examples only; adjust after checking Serial Monitor.
int RAW_DRY = 3000;
int RAW_WET = 1300;

const unsigned long SEND_INTERVAL_MS = 5000;
unsigned long lastSendMs = 0;

int readRawMoisture() {
  uint32_t total = 0;
  for (int i = 0; i < SAMPLES; i++) {
    total += analogRead(SENSOR_PIN);
    delay(20);
  }
  return total / SAMPLES;
}

int rawToPercent(int raw) {
  if (RAW_DRY == RAW_WET) return 0;
  int percent = map(raw, RAW_DRY, RAW_WET, 0, 100);
  return constrain(percent, 0, 100);
}

bool connectWiFi() {
  if (WiFi.status() == WL_CONNECTED) return true;
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  Serial.print("Connecting to Wi-Fi");

  unsigned long started = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - started < 20000) {
    delay(500);
    Serial.print('.');
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\nWi-Fi connected");
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }

  Serial.println("\nWi-Fi connection failed. Check hotspot credentials and 2.4 GHz Wi-Fi.");
  return false;
}

void sendReading() {
  if (!connectWiFi()) return;

  int raw = readRawMoisture();
  int moisture = rawToPercent(raw);

  Serial.println("\n------------------------------");
  Serial.printf("Device: %s\n", DEVICE_ID);
  Serial.printf("Raw sensor value: %d\n", raw);
  Serial.printf("Estimated moisture: %d%%\n", moisture);

  WiFiClientSecure tlsClient;
  // Simplifies initial testing but does not verify the server certificate.
  // For production, replace with proper CA certificate validation.
  tlsClient.setInsecure();

  HTTPClient https;
  https.setConnectTimeout(10000);
  https.setTimeout(15000);

  if (!https.begin(tlsClient, SERVER_URL)) {
    Serial.println("ERROR: Could not start HTTPS request.");
    return;
  }

  https.addHeader("Content-Type", "application/json");
  https.addHeader("x-device-key", DEVICE_API_KEY);

  String payload = "{\"deviceId\":\"";
  payload += DEVICE_ID;
  payload += "\",\"moisture\":";
  payload += String(moisture);
  payload += ",\"raw\":";
  payload += String(raw);
  payload += "}";

  Serial.print("POST payload: ");
  Serial.println(payload);

  int httpCode = https.POST(payload);
  Serial.printf("HTTP status: %d\n", httpCode);

  if (httpCode > 0) {
    String response = https.getString();
    Serial.print("Server response: ");
    Serial.println(response);
    if (httpCode >= 200 && httpCode < 300) {
      Serial.println("Reading accepted by backend.");
    } else {
      Serial.println("Backend rejected the request. Check API key, route and server logs.");
    }
  } else {
    Serial.print("HTTPS error: ");
    Serial.println(https.errorToString(httpCode));
  }

  https.end();
}

void setup() {
  Serial.begin(115200);
  delay(1000);
  analogReadResolution(12); // ESP32 ADC: 0-4095
  pinMode(SENSOR_PIN, INPUT);

  Serial.println("\nArecanut irrigation - Row 1 sensor starting");
  connectWiFi();
  sendReading();
  lastSendMs = millis();
}

void loop() {
  if (millis() - lastSendMs >= SEND_INTERVAL_MS) {
    lastSendMs = millis();
    sendReading();
  }
}
