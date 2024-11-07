import os
import pandas as pd
import numpy as np
from PIL import Image
import tensorflow as tf

# Get the current script's directory
current_dir = os.path.dirname(os.path.abspath(__file__))
weights_path = os.path.join(current_dir, 'NEWWEIGHTS', 'weightsfolder')

print(f"Looking for weights at: {weights_path}")


# Use tf.keras instead of keras for backwards compatibility
model = tf.keras.Sequential([
    tf.keras.layers.Conv2D(32, (3, 3), activation='relu', input_shape=(32, 32, 1)),
    tf.keras.layers.MaxPooling2D((2, 2)),
    tf.keras.layers.Conv2D(64, (3, 3), activation='relu'),
    tf.keras.layers.MaxPooling2D((2, 2)),
    tf.keras.layers.Conv2D(64, (3, 3), activation='relu'),
    tf.keras.layers.Flatten(),
    tf.keras.layers.Dense(64, activation='relu'),
    tf.keras.layers.Dense(10, activation='softmax')
])

# Compile the model (needed for tf.keras)
model.compile(
    optimizer='adam',
    loss='sparse_categorical_crossentropy',
    metrics=['accuracy']
)

try:
    # Add BatchNormalization layers to the model definition
    model = tf.keras.Sequential([
        tf.keras.layers.Conv2D(32, (3, 3), padding='same', input_shape=(32, 32, 1)),
        tf.keras.layers.BatchNormalization(),
        tf.keras.layers.Activation('relu'),
        tf.keras.layers.MaxPooling2D((2, 2)),

        tf.keras.layers.Conv2D(64, (3, 3), padding='same'),
        tf.keras.layers.BatchNormalization(), 
        tf.keras.layers.Activation('relu'),
        tf.keras.layers.MaxPooling2D((2, 2)),

        tf.keras.layers.Conv2D(128, (3, 3), padding='same'),
        tf.keras.layers.BatchNormalization(),
        tf.keras.layers.Activation('relu'), 
        tf.keras.layers.MaxPooling2D((2, 2)),

        tf.keras.layers.Conv2D(256, (3, 3), padding='same'),
        tf.keras.layers.BatchNormalization(),
        tf.keras.layers.Activation('relu'),
        tf.keras.layers.MaxPooling2D((2, 2)),

        tf.keras.layers.Conv2D(512, (3, 3), padding='same'),
        tf.keras.layers.BatchNormalization(),
        tf.keras.layers.Activation('relu'),
        tf.keras.layers.MaxPooling2D((2, 2)),

        tf.keras.layers.Flatten(),
        tf.keras.layers.Dense(256, activation='relu'),
        tf.keras.layers.Dropout(0.5),
        tf.keras.layers.Dense(369, activation='softmax')
    ])
    checkpoint = tf.train.Checkpoint(model=model)
    checkpoint.restore(os.path.join(weights_path, 'weights')).expect_partial()
    print("Weights loaded successfully")
except Exception as e:
    print(f"Error loading weights: {str(e)}")
    raise

def preprocess_image(image_path):
    """Preprocess a single image for prediction"""
    img = Image.open(image_path).convert('L')  # Convert to grayscale
    img = img.resize((32, 32))  # Resize to match model input
    img_array = np.array(img)
    img_array = img_array.reshape(1, 32, 32, 1)  # Add batch dimension and channel
    img_array = img_array / 255.0  # Normalize
    return img_array

def predict_single_image(image_path):
    """Make prediction on a single image"""
    processed_image = preprocess_image(image_path)
    prediction = model(processed_image)  # Using call() instead of predict()
    #if isinstance(prediction, dict):
       #prediction = prediction['output']  # Adjust based on your model's output name
    predicted_class = np.argmin(prediction)
    confidence = np.min(prediction)
    return predicted_class, confidence

def test_model_on_directory(test_dir):
    """Test the model on all images in a directory"""
    results = []
    for image_file in os.listdir(test_dir):
        if image_file.lower().endswith(('.png', '.jpg', '.jpeg')):
            image_path = os.path.join(test_dir, image_file)
            try:
                predicted_class, confidence = predict_single_image(image_path)
                results.append({
                    'image': image_file,
                    'predicted_class': predicted_class,
                    'confidence': confidence
                })
            except Exception as e:
                print(f"Error processing {image_file}: {str(e)}")
    
    return pd.DataFrame(results)

# Example usage:
if __name__ == "__main__":
    # Test a single image
    image_path = "./v2-23107.png"
    predicted_class, confidence = predict_single_image(image_path)
    print(f"Predicted class: {predicted_class}, Confidence: {confidence:.2f}")

    # Test on a directory of images
    # test_directory = "path/to/test/directory"
    # results_df = test_model_on_directory(test_directory)
    # print(results_df)

