import numpy as np
from PIL import Image
import tensorflow as tf
from tensorflow.keras.models import load_model
import pandas as pd
import matplotlib.pyplot as plt

def preprocess_image(img_array):
    print("Preprocessing steps:")
    print("1. Input array min/max values:", np.min(img_array), np.max(img_array))
    
    # Resize to 32x32 and reshape for model input
    img = Image.fromarray(img_array)
    img = img.resize((32, 32))
    processed = np.array(img)
    print("2. After resize min/max values:", np.min(processed), np.max(processed))
    
    processed = processed.reshape(1, 32, 32, 1)
    print("3. After reshape shape:", processed.shape)
    
    processed = processed / 255.0
    print("4. After normalization min/max values:", np.min(processed), np.max(processed))
    return processed

# Load the model
model = load_model('./model/cnn_hasy_model.h5')

# Load symbol mapping
symbols_df = pd.read_csv('./symbols.csv')
class_mapping = dict(zip(range(len(symbols_df)), symbols_df['latex']))

# Test multiple images
test_images = ['v2-23107.png', 'v2-57175.png']  # Add more test images as needed

for img_path in test_images:
    print(f"\nTesting image: {img_path}")
    
    # Load and preprocess test image
    test_img = Image.open(img_path).convert('L')
    img_array = np.array(test_img)
    
    print("Original image shape:", img_array.shape)
    processed_img = preprocess_image(img_array)
    print("Processed image shape:", processed_img.shape)
    
    # Make prediction
    prediction = model.predict(processed_img)
    predicted_class = np.argmax(prediction[0])
    predicted_symbol = class_mapping[predicted_class]
    
    print("\nPrediction Results:")
    print("Predicted symbol:", predicted_symbol)
    print("Confidence score:", prediction[0][predicted_class])
    
    # Show top 5 predictions
    top_5_indices = np.argsort(prediction[0])[-5:][::-1]
    print("\nTop 5 predictions:")
    for idx in top_5_indices:
        print(f"{class_mapping[idx]}: {prediction[0][idx]:.4f}")
    
    # Optional: Display the image
    plt.figure(figsize=(5,5))
    plt.imshow(img_array, cmap='gray')
    plt.title(f"Input Image: {img_path}")
    plt.show()
