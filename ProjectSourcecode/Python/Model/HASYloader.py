import os
import pandas as pd
import numpy as np
from PIL import Image
import tensorflow as tf
from tensorflow.keras.models import Sequential
from tensorflow.keras.layers import Conv2D, MaxPooling2D, Flatten, Dense, BatchNormalization, Activation
from hasy_tools import load_images, generate_index
from tensorflow.keras.utils import to_categorical


class HASYv2Loader:
    def __init__(self, data_dir, classification_task_dir):
        self.data_dir = data_dir
        self.classification_task_dir = classification_task_dir

    def load_fold_data(self, fold):
        """Load the training and testing data for a specific fold"""

        print("Is TensorFlow using the GPU?", tf.config.list_physical_devices('GPU'))
        train_csv = os.path.join(self.classification_task_dir, f"fold-{fold}", "train.csv")
        test_csv = os.path.join(self.classification_task_dir, f"fold-{fold}", "test.csv")


        # Load train and test data
        X_train, y_train = load_images(train_csv, generate_index(train_csv))
        X_test, y_test = load_images(test_csv, generate_index(test_csv))
        # Convert labels to one-hot encoding



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

# Perform 10-fold cross-validation using predefined train/test splits
for fold in range(1, 11):  # Assuming there are 10 folds
    print(f"Training on fold {fold}/10...")

    # Load the data for the current fold
    X_train, y_train, X_test, y_test = loader.load_fold_data(fold)

    # Define the CNN model
    model = Sequential([
        Conv2D(32, (3, 3), input_shape=(32, 32, 1)),
        BatchNormalization(),  # Add Batch Normalization
        Activation('relu'),  # Activation applied after batch norm
        MaxPooling2D((2, 2)),

        # Second Convolutional Layer with Batch Normalization
        Conv2D(64, (3, 3)),
        BatchNormalization(),
        Activation('relu'),
        MaxPooling2D((2, 2)),

        # Third Convolutional Layer with Batch Normalization
        Conv2D(128, (3, 3)),
        BatchNormalization(),
        Activation('relu'),
        MaxPooling2D((2, 2)),

        Flatten(),
        Dense(128, activation='relu'),
        Dense(369, activation='softmax') #rep with 369?
    ])

    # Compile the model
    model.compile(optimizer='adam', loss='categorical_crossentropy', metrics=['accuracy'])

    print(f"y_train shape before fit: {y_train.shape}")
    print(f"y_test shape before fit: {y_test.shape}")

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

model.save('./3_layer_model')