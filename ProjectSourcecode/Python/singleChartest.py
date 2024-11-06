import cv2
import numpy as np
import tensorflow as tf
from process_to_lines import preprocess_char, plot_processed_image
import matplotlib.pyplot as plt

def test_single_symbol(image_path, model_path="./3layer_model_plus_tools/3_layer_model.h5"):
    """
    Test a single symbol from the HASY dataset (already preprocessed to 32x32).
    
    Args:
        image_path: Path to the PNG image file
        model_path: Path to the saved model
    """
    # Load the model
    model = tf.keras.models.load_model(model_path, compile=False)
    
    # Load image directly - it's already 32x32
    img = cv2.imread(image_path, cv2.IMREAD_GRAYSCALE)
    plt.figure(figsize=(4, 4))
    plt.imshow(img, cmap='gray')
    plt.title("Input Image")
    plt.axis('off')
    plt.show()
    # Normalize pixel values to [0, 1]
    img = img.astype('float32') / 255.0
    
    # Plot the image
    plt.figure(figsize=(4, 4))
    plt.imshow(img, cmap='gray')
    plt.title("Input Image")
    plt.axis('off')
    plt.show()
    
    # Prepare for prediction
    input_data = np.expand_dims(img, axis=(0, -1))  # Shape will be (1, 32, 32, 1)
    
    # Make prediction
    prediction = model.predict(input_data)
    predicted_label = np.argmax(prediction, axis=1)[0]
    confidence = prediction[0][predicted_label]
    
    print(f"Predicted Label Index: {predicted_label}")
    print(f"Confidence: {confidence:.4f}")
    
    # Print the top 3 predictions and their confidences
    top_3_indices = np.argsort(prediction[0])[-3:][::-1]
    print("\nTop 3 Predictions:")
    for idx in top_3_indices:
        print(f"Label {idx}: {prediction[0][idx]:.4f}")

        
if __name__ == "__main__":
    # Test with a sample image from the HASY dataset
    test_image_path = "./hasytestcharA.png"  # Replace with actual path
    test_single_symbol(test_image_path)