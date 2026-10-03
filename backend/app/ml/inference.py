from pathlib import Path
from PIL import Image
import io
import json
import torch
import torch.nn as nn
from torchvision import models, transforms
from ultralytics import YOLO

BASE = Path(__file__).resolve().parent
MODEL_DIR = BASE / 'models'
DEVICE = torch.device('cuda' if torch.cuda.is_available() else 'cpu')

# ---------------- BeeImage CNN ----------------
class BeeCNN(nn.Module):
    def __init__(self):
        super().__init__()
        self.conv1 = nn.Conv2d(3, 5, 3, padding=1)
        self.pool = nn.MaxPool2d(2, 2)
        self.conv2 = nn.Conv2d(5, 10, 3, padding=1)
        self.fc = nn.Linear(25000, 6)
    def forward(self, x):
        x = torch.relu(self.conv1(x))
        x = self.pool(x)
        x = torch.relu(self.conv2(x))
        return self.fc(torch.flatten(x, 1))

bee = BeeCNN()
bee_ckpt = torch.load(MODEL_DIR / 'bee_health_cnn_best.pth', map_location=DEVICE, weights_only=False)
bee.load_state_dict(bee_ckpt['state_dict'])
bee.to(DEVICE).eval()
BEE_CLASSES = bee_ckpt.get('class_mapping', {
    '0':'healthy','1':'few varroa / hive beetles','2':'varroa / small hive beetles',
    '3':'ant problems','4':'hive being robbed','5':'missing queen'
})

# ---------------- VERRDO EfficientNet ----------------
eff = models.efficientnet_b0(weights=None)
eff.classifier[1] = nn.Linear(eff.classifier[1].in_features, 2)
eff_ckpt = torch.load(MODEL_DIR / 'efficientnet_b0_varroa_best.pth', map_location=DEVICE, weights_only=False)
eff.load_state_dict(eff_ckpt['model_state_dict'])
eff.to(DEVICE).eval()

# ---------------- VERRDO YOLO ----------------
yolo = YOLO(str(MODEL_DIR / 'varroa_yolo11n_best.pt'))
bee_detector = YOLO(str(MODEL_DIR / 'bee_final.pt')) if (MODEL_DIR / 'bee_final.pt').exists() else None

bee_tf = transforms.Compose([
    transforms.Resize((100, 100)),
    transforms.ToTensor(),
])
eff_tf = transforms.Compose([
    transforms.Resize((224, 224)),
    transforms.ToTensor(),
    transforms.Normalize([0.485,0.456,0.406],[0.229,0.224,0.225])
])


def _image(x):
    if isinstance(x, Image.Image):
        return x.convert('RGB')
    return Image.open(io.BytesIO(x)).convert('RGB')


def predict_image(raw):
    image = _image(raw)
    with torch.no_grad():
        bp = torch.softmax(bee(bee_tf(image).unsqueeze(0).to(DEVICE)), 1)[0].cpu().tolist()
        ep = torch.softmax(eff(eff_tf(image).unsqueeze(0).to(DEVICE)), 1)[0].cpu().tolist()

    bee_idx = int(max(range(len(bp)), key=lambda i: bp[i]))
    bee_infestation = float(bp[1] + bp[2])
    eff_infestation = float(ep[1])

    bee_detection_result = bee_detector.predict(source=image, conf=0.20, verbose=False)[0] if bee_detector else None
    bee_detections = []
    if bee_detection_result is not None:
        for b in bee_detection_result.boxes:
            cls_id = int(b.cls[0].cpu()) if b.cls is not None else 0
            bee_detections.append({
                'confidence': float(b.conf[0].cpu()),
                'class': (bee_detector.names.get(cls_id, str(cls_id)) if hasattr(bee_detector, 'names') else str(cls_id))
            })

    result = yolo.predict(source=image, conf=0.25, verbose=False)[0]
    boxes = []
    for b in result.boxes:
        xyxy = b.xyxy[0].cpu().tolist()
        boxes.append({'x1':xyxy[0],'y1':xyxy[1],'x2':xyxy[2],'y2':xyxy[3],
                      'confidence':float(b.conf[0].cpu()),'class':'varroa_mite'})
    yolo_score = max((x['confidence'] for x in boxes), default=0.0)

    # Transparent visual fusion. Weights are fixed and intentionally exposed.
    visual_score = 0.35 * bee_infestation + 0.50 * eff_infestation + 0.15 * yolo_score
    if visual_score >= 0.75: band = 'High Concern'
    elif visual_score >= 0.50: band = 'Monitor'
    else: band = 'Low Concern'

    return {
        'visualScore': round(visual_score, 4),
        'visualStatus': band,
        'beeHealth': {
            'class': BEE_CLASSES.get(str(bee_idx), str(bee_idx)),
            'confidence': round(float(bp[bee_idx]), 4),
            'infestationEvidence': round(bee_infestation, 4),
            'probabilities': {BEE_CLASSES.get(str(i), str(i)): round(float(p),4) for i,p in enumerate(bp)}
        },
        'beeDetector': {
            'available': bee_detector is not None,
            'detections': bee_detections,
            'beeCount': sum(1 for x in bee_detections if x['class'] == 'bee'),
            'blurredBeeCount': sum(1 for x in bee_detections if x['class'] == 'blurred_bee')
        },
        'varroa': {
            'infestedProbability': round(eff_infestation, 4),
            'miteCount': len(boxes),
            'maxDetectionConfidence': round(yolo_score, 4),
            'boxes': boxes
        },
        'fusion': {
            'beeImageWeight': 0.35,
            'verrdoEfficientNetWeight': 0.50,
            'verrdoYoloWeight': 0.15,
            'thresholds': {'monitor':0.50,'high':0.75}
        },
        'modelVersion': 'HoneyChain visual fusion v1.1 + bee detector',
        'device': str(DEVICE),
        'imageWidth': image.width,
        'imageHeight': image.height,
    }
