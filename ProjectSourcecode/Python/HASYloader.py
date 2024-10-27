import os
import pandas as pd
import numpy as np
from PIL import Image
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv2D, MaxPooling2D, Flatten, Dense
from hasy_tools import load_images_and_labels  # Assuming this function is in hasy_tools.py




class HASYv2Loader:
    def __init__(self, data_dir, classification_task_dir):
        self.data_dir = data_dir
        self.classification_task_dir = classification_task_dir

    def load_fold_data(self, fold):
        """Load the training and testing data for a specific fold"""
        train_csv = os.path.join(self.classification_task_dir, f"train{fold}.csv")
        test_csv = os.path.join(self.classification_task_dir, f"test{fold}.csv")

        # Load train and test data
        X_train, y_train = load_images_and_labels(train_csv, self.data_dir)
        X_test, y_test = load_images_and_labels(test_csv, self.data_dir)

        # Reshape for CNN input
        X_train = X_train.reshape(-1, 32, 32, 1)
        X_test = X_test.reshape(-1, 32, 32, 1)

        # Convert labels to one-hot encoding
        num_classes = len(np.unique(y_train))
        y_train = tf.keras.utils.to_categorical(y_train, num_classes)
        y_test = tf.keras.utils.to_categorical(y_test, num_classes)

        return X_train, y_train, X_test, y_test

# Specify the paths to your HASYv2 data and classification task directory
data_dir = "path/to/hasy_data"  # Directory containing images
classification_task_dir = "path/to/classification-task"  # Directory containing predefined train/test CSVs

# Create a loader instance
loader = HASYv2Loader(data_dir, classification_task_dir)

# Placeholder for tracking performance across folds
fold_accuracies = []
fold_losses = []

# Perform 10-fold cross-validation using predefined train/test splits
for fold in range(1, 11):  # Assuming there are 10 folds
    print(f"Training on fold {fold}/10...")

    # Load the data for the current fold
    X_train, y_train, X_test, y_test = loader.load_fold_data(fold)

    # Define the CNN model
    model = Sequential([
        Conv2D(32, (3, 3), activation='relu', input_shape=(32, 32, 1)),
        MaxPooling2D((2, 2)),
        Conv2D(64, (3, 3), activation='relu'),
        MaxPooling2D((2, 2)),
        Flatten(),
        Dense(128, activation='relu'),
        Dense(len(np.unique(y_train)), activation='softmax')
    ])

    # Compile the model
    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

    # Train the model on the current fold's training data
    model.fit(X_train, y_train, epochs=10, batch_size=32, validation_data=(X_test, y_test), verbose=0)

    # Evaluate the model on the test data (current fold)
    test_loss, test_accuracy = model.evaluate(X_test, y_test, verbose=0)
    print(f"Fold {fold} - Loss: {test_loss:.4f} - Accuracy: {test_accuracy:.4f}")

    # Append metrics
    fold_accuracies.append(test_accuracy)
    fold_losses.append(test_loss)

# Report mean and std deviation of performance across folds
print(f"\nMean Accuracy: {np.mean(fold_accuracies):.4f} ± {np.std(fold_accuracies):.4f}")
print(f"Mean Loss: {np.mean(fold_losses):.4f} ± {np.std(fold_losses):.4f}")

# Save the final model after training on the last fold (optional)
model.save('cnn_hasy_model.h5')
