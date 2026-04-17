import copy
import warnings
import time
import torch
import torch.nn as nn
import torch.optim as optim
from torchvision import models, transforms
from torchvision.models import ResNet50_Weights
from PIL import Image
from datasets import load_dataset

warnings.filterwarnings("ignore")

# ==============================================================================
# Data Loading Setup (Hugging Face LADI-v2)
# ==============================================================================
DATASET_NAME = "MITLL/LADI-v2-dataset"
TARGET_LABELS = [
    "buildings_affected_or_greater",
    "buildings_minor_or_greater",
    "roads_damage",
    "trees_damage",
    "flooding_structures",
    "debris_any"
]

class LadiDataset(torch.utils.data.Dataset):
    def __init__(self, hf_dataset, transform=None):
        self.hf_dataset = list(hf_dataset)
        self.transform = transform

    def __len__(self):
        return len(self.hf_dataset)

    def __getitem__(self, idx):
        item = self.hf_dataset[idx]
        image = item["image"].convert("RGB")

        if self.transform:
            image = self.transform(image)

        labels = [float(item[label]) for label in TARGET_LABELS]
        return image, torch.tensor(labels, dtype=torch.float32)

def get_dataloaders(batch_size=8, max_train=1000, max_val=200):
    print(f"Streaming {DATASET_NAME} from Hugging Face to skip massive download...")

    # Using streaming=True downloads ONLY the images requested in real-time, completely bypassing the massive dataset archive download!
    dataset = load_dataset(DATASET_NAME, streaming=True)
    train_split = dataset.get("train")
    val_split = dataset.get("validation") or dataset.get("valid") or dataset.get("val")

    if train_split is None or val_split is None:
        raise ValueError("Missing train/validation splits in the dataset.")

    print(f"Building local cache of {max_train} train and {max_val} val images dynamically...")
    train_split = list(train_split.take(max_train))
    val_split = list(val_split.take(max_val))

    data_transforms = {
        "train": transforms.Compose([
            transforms.RandomResizedCrop(224),
            transforms.RandomHorizontalFlip(),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ]),
        "val": transforms.Compose([
            transforms.Resize(256),
            transforms.CenterCrop(224),
            transforms.ToTensor(),
            transforms.Normalize([0.485, 0.456, 0.406], [0.229, 0.224, 0.225])
        ]),
    }

    train_ds = LadiDataset(train_split, transform=data_transforms["train"])
    val_ds = LadiDataset(val_split, transform=data_transforms["val"])

    print(f"Train samples: {len(train_ds)}, Val samples: {len(val_ds)}")

    dataloaders = {
        "train": torch.utils.data.DataLoader(
            train_ds, batch_size=batch_size, shuffle=True, num_workers=0
        ),
        "val": torch.utils.data.DataLoader(
            val_ds, batch_size=batch_size, shuffle=False, num_workers=0
        )
    }

    dataset_sizes = {"train": len(train_ds), "val": len(val_ds)}

    return dataloaders, dataset_sizes, TARGET_LABELS

# ==============================================================================
# Model Architecture Definition
# ==============================================================================
def build_model(num_classes):
    print("Loading pre-trained ResNet50 model...")
    model = models.resnet50(weights=ResNet50_Weights.IMAGENET1K_V1)
    
    num_ftrs = model.fc.in_features
    # Replace final fully connected layer for Multi-Class execution
    model.fc = nn.Sequential(
        nn.Dropout(0.5),
        nn.Linear(num_ftrs, num_classes)
    )
    
    return model

# ==============================================================================
# Training Loop (Multi-Class)
# ==============================================================================
def train_model(model, dataloaders, dataset_sizes, criterion, optimizer, num_epochs=5, device="cpu"):
    epoch_times = []
    model = model.to(device)
    best_model_wts = copy.deepcopy(model.state_dict())
    best_acc = 0.0

    print(f"Starting Multi-Class training on device: {device}")
    
    for epoch in range(num_epochs):
        epoch_start = time.time()
        print(f"\nEpoch {epoch+1}/{num_epochs}")
        print("-" * 50)

        for phase in ['train', 'val']:
            if phase == 'train':
                model.train()
            else:
                model.eval()

            running_loss = 0.0
            running_corrects = 0
            samples_processed = 0

            from tqdm import tqdm
            progress_bar = tqdm(dataloaders[phase], desc=f"{phase.capitalize()} (Epoch {epoch+1}/{num_epochs})")
            for inputs, labels in progress_bar:
                inputs = inputs.to(device)
                labels = labels.to(device)

                optimizer.zero_grad()

                with torch.set_grad_enabled(phase == 'train'):
                    outputs = model(inputs)
                    
                    preds = (torch.sigmoid(outputs) > 0.5).float()
                    loss = criterion(outputs, labels)

                    if phase == 'train':
                        loss.backward()
                        optimizer.step()

                running_loss += loss.item() * inputs.size(0)
                running_corrects += torch.sum(preds == labels.data)
                samples_processed += inputs.size(0)
                
                progress_bar.set_postfix({'loss': f"{loss.item():.4f}"})

            epoch_loss = running_loss / samples_processed
            total_elements = dataset_sizes[phase] * len(TARGET_LABELS)
            epoch_acc = running_corrects.double() / total_elements

            print(f"{phase.capitalize()} Loss: {epoch_loss:.4f} Acc: {epoch_acc:.4f}")

            if phase == 'val' and epoch_acc > best_acc:
                best_acc = epoch_acc
                best_model_wts = copy.deepcopy(model.state_dict())

        epoch_end = time.time()
        dur = epoch_end - epoch_start
        epoch_times.append(dur)
        print(f"Epoch {epoch+1} completed in {dur:.2f} seconds.")

    print(f"\nTraining complete. Best Val Acc: {best_acc:.4f}")
    if len(epoch_times) > 0:
        avg_epoch_time = sum(epoch_times) / len(epoch_times)
        print(f"Average epoch time: {avg_epoch_time:.2f}s. Estimated time for 10 epochs: {(avg_epoch_time * 10)/60:.2f} mins.")

    model.load_state_dict(best_model_wts)
    return model

# ==============================================================================
# Inference Function
# ==============================================================================
def analyze_uploaded_image(image_tensor, model, class_names, device="cpu"):
    model.eval()
    model = model.to(device)
    
    # Adds batch dimension [1, C, H, W]
    input_batch = image_tensor.unsqueeze(0).to(device)
    
    with torch.no_grad():
        output = model(input_batch)
        
    probabilities = torch.sigmoid(output[0])

    results = []
    for i, class_name in enumerate(class_names):
        conf = probabilities[i].item() * 100
        detected = "DETECTED" if conf > 50.0 else "CLEAR   "
        results.append(f"  - [{detected}] {class_name}: {conf:.1f}% confidence")

    return "\n".join(results)

# ==============================================================================
# Main Execution
# ==============================================================================
if __name__ == "__main__":
    t0 = time.time()
    
    # 1. Setup Data
    dataloaders, dataset_sizes, class_names = get_dataloaders(batch_size=8, max_train=1000, max_val=200)
    print(f"Tracking {len(class_names)} Categories: {class_names}")

    # 2. Setup Device
    device = torch.device("cuda:0" if torch.cuda.is_available() else "cpu")
    print(f"Using device: {device}\n")

    # 3. Build Model
    model = build_model(num_classes=len(class_names))

    # 4. Setup Multi-Label Loss and Optimizer
    criterion = nn.BCEWithLogitsLoss()
    optimizer = optim.Adam(model.fc.parameters(), lr=0.001)

    # 5. Train Model
    print("=" * 50)
    trained_model = train_model(model, dataloaders, dataset_sizes, criterion, optimizer, num_epochs=2, device=device)
    print("=" * 50)

    # 6. Save the trained model
    model_save_path = r"c:\ZDATA\Disaster Management\disaster_classifier_trained.pth"
    torch.save(trained_model.state_dict(), model_save_path)
    print(f"\nModel saved to: {model_save_path}")

    # 7. Test Inference on a sample from validation set
    print("\nTesting Inference on an image from the Validation Dataloader...")

    val_iter = iter(dataloaders["val"])
    sample_inputs, sample_labels = next(val_iter)
    test_tensor = sample_inputs[0]

    print("\nMODEL PREDICTIONS:")
    result = analyze_uploaded_image(test_tensor, trained_model, class_names, device)
    print(result)

    t1 = time.time()
    print(f"\nTOTAL PIPELINE COMPLETED IN: {(t1 - t0) / 60:.2f} MINUTES")