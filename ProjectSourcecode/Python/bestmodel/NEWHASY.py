import os
import pandas as pd
import csv
import numpy as np
from PIL import Image
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv2D, MaxPooling2D, Flatten, Dense, BatchNormalization, Activation, Dropout
from hasy_tools import load_images, generate_index
from tensorflow.keras.utils import to_categorical
import imageio


def preprocess_image(filepath):
    WIDTH, HEIGHT = 32, 32

    # Load the image
    img = imageio.imread(filepath)

    # Convert to grayscale if it’s in RGB or RGBA
    if img.ndim == 3 and img.shape[2] == 3:
        img = np.mean(img, axis=2).astype(np.uint8)  # Convert RGB to grayscale by averaging channels
    elif img.ndim == 3 and img.shape[2] == 4:
        img = np.mean(img[:, :, :3], axis=2).astype(np.uint8)  # Ignore the alpha channel

    # Reshape and add depth dimension
    img = img.reshape(WIDTH, HEIGHT, 1)

    # Normalize if the model was trained on normalized data (e.g., scale pixel values to [0, 1])
    img = img / 255.0

    # Add batch dimension
    img = np.expand_dims(img, axis=0)  # Shape becomes (1, 32, 32, 1)

    return img


def load_symbol_mapping(self):
    """
    Load symbol mapping from symbols.csv
    Format: symbol_id,latex,training_samples,test_samples
    """
    symbol_map = {}
    try:
        with open('symbols.csv', 'r') as f:
            reader = csv.reader(f)
            next(reader)  # Skip header
            for row in reader:
                symbol_id = int(row[0])
                latex = row[1]
                symbol_map[symbol_id] = latex
    except FileNotFoundError:
        print("Error: symbols.csv not found!")
    except Exception as e:
        print(f"Error loading symbols.csv: {e}")
    return symbol_map


def predict_symbol(image_path, model_path='best_model.h5'):
    """
    Predict symbol from image and return both the ID and LaTeX representation
    """
    # Load the model
    loaded_model = tf.keras.models.load_model(model_path)

    # Load symbol mapping
    symbol_map = loader.load_symbol_mapping()

    # Preprocess and predict
    processed_image = preprocess_image(image_path)
    predictions = loaded_model.predict(processed_image)

    # Get top 3 predictions
    top_3_indices = np.argsort(predictions[0])[-3:][::-1]
    top_3_probabilities = predictions[0][top_3_indices]

    results = []
    for idx, prob in zip(top_3_indices, top_3_probabilities):
        latex = symbol_map.get(idx, f"Unknown symbol ID: {idx}")
        results.append({
            'symbol_id': idx,
            'latex': latex,
            'probability': float(prob)
        })

    return results


class HASYv2Loader:
    def __init__(self, data_dir, classification_task_dir):
        self.data_dir = data_dir
        self.classification_task_dir = classification_task_dir

    def load_all_fold_data(self, current_fold):
        X_train_all = []
        y_train_all = []

        # Load test data from current fold
        test_csv = os.path.join(self.classification_task_dir, f"fold-{current_fold}", "test.csv")
        X_test, y_test = load_images(test_csv, generate_index(test_csv))

        # Load and combine training data from all other folds
        for fold in range(1, 11):
            if fold != current_fold:
                train_csv = os.path.join(self.classification_task_dir, f"fold-{fold}", "train.csv")
                X_fold, y_fold = load_images(train_csv, generate_index(train_csv))
                X_train_all.append(X_fold)
                y_train_all.append(y_fold)

        # Combine all training data
        X_train = np.concatenate(X_train_all, axis=0)
        y_train = np.concatenate(y_train_all, axis=0)

        # Reshape for CNN input
        X_train = X_train.reshape(-1, 32, 32, 1)
        X_test = X_test.reshape(-1, 32, 32, 1)

        return X_train, y_train, X_test, y_test


# Specify the paths to your HASYv2 data and classification task directory
data_dir = "hasy-data"  # Directory containing images
classification_task_dir = "classification-task"  # Directory containing predefined train/test CSVs

# Create a loader instance
loader = HASYv2Loader(data_dir, classification_task_dir)

# Placeholder for tracking performance across folds
fold_accuracies = []
fold_losses = []
best_accuracy = 0
best_model = None
# Perform 10-fold cross-validation using predefined train/test splits
for fold in range(1, 11):  # Assuming there are 10 folds
    print(f"Training on fold {fold}/10...")

    # Load the data for the current fold
    X_train, y_train, X_test, y_test = loader.load_all_fold_data(fold)

    # Define the CNN model
    model = Sequential([
        # First Conv + Pool block
        Conv2D(32, (3, 3), padding='same', input_shape=(32, 32, 1)),
        MaxPooling2D((2, 2), strides=2),

        # Second Conv + Pool block
        Conv2D(64, (3, 3), padding='same'),
        MaxPooling2D((2, 2), strides=2),

        # Flatten before dense layers
        Flatten(),

        # Dense layer with tanh activation
        Dense(1024, activation='tanh'),

        # Dropout layer
        Dropout(0.5),

        # Output layer
        Dense(369, activation='softmax')  # 369 classes
    ])

    initial_learning_rate = 0.001
    lr_schedule = tf.keras.optimizers.schedules.ExponentialDecay(
        initial_learning_rate,
        decay_steps=1000,
        decay_rate=0.9)
    optimizer = tf.keras.optimizers.Adam(learning_rate=lr_schedule)
    model.compile(optimizer=optimizer,
                  loss='categorical_crossentropy',
                  metrics=['accuracy', 'Precision', 'Recall', 'AUC'])
    print(f"y_train shape before fit: {y_train.shape}")
    print(f"y_test shape before fit: {y_test.shape}")

    # Train the model on the current fold's training data
    history = model.fit(X_train, y_train, epochs=10, batch_size=64, validation_data=(X_test, y_test), verbose=1)

    # Evaluate the model on the test data (current fold)
    test_loss, test_accuracy, precision, recall, auc = model.evaluate(X_test, y_test, verbose=0)
    print(
        f"Fold {fold} - Loss: {test_loss:.4f} - Accuracy: {test_accuracy:.4f} - Precision: {precision:.4f} - Recall: {recall:.4f} - AUC: {auc:.4f}")
    if test_accuracy > best_accuracy:
        best_accuracy = test_accuracy
        best_model = tf.keras.models.clone_model(model)
        best_model.set_weights(model.get_weights())
        print(f"New best model saved with accuracy: {best_accuracy:.4f}")
    # Append metrics
    fold_accuracies.append(test_accuracy)
    fold_losses.append(test_loss)

# Report mean and std deviation of performance across folds
print(f"\nMean Accuracy: {np.mean(fold_accuracies):.4f} ± {np.std(fold_accuracies):.4f}")
print(f"Mean Loss: {np.mean(fold_losses):.4f} ± {np.std(fold_losses):.4f}")
best_model.save('best_model.h5')

image_path = 'hasytestcharA.png'

# Example usage

predictions = predict_symbol(image_path)

print("\nTop 3 predictions:")
for i, pred in enumerate(predictions, 1):
    print(f"{i}. LaTeX: {pred['latex']}")
    print(f"   Symbol ID: {pred['symbol_id']}")
    print(f"   Probability: {pred['probability']:.4f}")